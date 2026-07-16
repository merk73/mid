-- Three editor access levels backed by Supabase Auth and enforced in Postgres.
alter table public.editor_members drop constraint if exists editor_members_role_check;
alter table public.editor_members drop constraint if exists editor_members_approval_state_check;

update public.editor_members set role = 'full' where role = 'editor';

alter table public.editor_members
  add constraint editor_members_role_check
  check (role in ('pending', 'limited', 'full', 'admin'));

alter table public.editor_members
  add constraint editor_members_approval_state_check
  check (
    (role = 'pending' and approved_at is null and approved_by is null)
    or (role in ('limited', 'full', 'admin') and approved_at is not null)
  );

create or replace function midgas_private.has_editor_role(required_role text default 'limited')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.editor_members as member
    where member.user_id = (select auth.uid())
      and member.approved_at is not null
      and case
        when required_role = 'admin' then member.role = 'admin'
        when required_role = 'full' then member.role in ('full', 'admin')
        else member.role in ('limited', 'full', 'admin')
      end
  );
$$;

create table midgas_private.editor_login_accounts (
  login text primary key check (login = lower(login) and login ~ '^[a-z0-9_-]{3,40}$'),
  password_hash text not null,
  access_role text not null check (access_role in ('limited', 'full', 'admin')),
  internal_email text not null unique,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table midgas_private.editor_login_attempts (
  id bigint generated always as identity primary key,
  login text not null,
  ip_hash text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);

create index editor_login_attempts_guard_idx
  on midgas_private.editor_login_attempts (login, ip_hash, attempted_at desc)
  where success is false;

revoke all on table midgas_private.editor_login_accounts from public, anon, authenticated;
revoke all on table midgas_private.editor_login_attempts from public, anon, authenticated;

create or replace function public.verify_editor_credentials(
  p_login text,
  p_password text,
  p_ip_hash text
)
returns table (
  account_login text,
  internal_email text,
  access_role text,
  auth_user_id uuid,
  is_valid boolean,
  is_locked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_login text := lower(btrim(p_login));
  account midgas_private.editor_login_accounts%rowtype;
  failed_attempts integer;
  password_valid boolean := false;
begin
  delete from midgas_private.editor_login_attempts
  where attempted_at < now() - interval '7 days';

  select count(*)::integer
  into failed_attempts
  from midgas_private.editor_login_attempts
  where login = normalized_login
    and ip_hash = p_ip_hash
    and success is false
    and attempted_at > now() - interval '15 minutes';

  if failed_attempts >= 5 then
    return query select normalized_login, null::text, null::text, null::uuid, false, true;
    return;
  end if;

  select * into account
  from midgas_private.editor_login_accounts
  where login = normalized_login;

  if found then
    password_valid := account.password_hash = extensions.crypt(p_password, account.password_hash);
  end if;

  insert into midgas_private.editor_login_attempts (login, ip_hash, success)
  values (normalized_login, p_ip_hash, password_valid);

  if not password_valid then
    return query select normalized_login, null::text, null::text, null::uuid, false, false;
    return;
  end if;

  return query select account.login, account.internal_email, account.access_role, account.auth_user_id, true, false;
end;
$$;

create or replace function public.bind_editor_auth_user(
  p_login text,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_login text := lower(btrim(p_login));
  assigned_role text;
begin
  update midgas_private.editor_login_accounts
  set auth_user_id = p_user_id,
      updated_at = now()
  where login = normalized_login
  returning access_role into assigned_role;

  if assigned_role is null then
    raise exception 'Unknown editor login.' using errcode = '22023';
  end if;

  insert into public.editor_members (user_id, role, approved_at, approved_by)
  values (p_user_id, assigned_role, now(), null)
  on conflict (user_id) do update
  set role = excluded.role,
      approved_at = coalesce(public.editor_members.approved_at, excluded.approved_at),
      approved_by = public.editor_members.approved_by;

  return assigned_role;
end;
$$;

create or replace function public.change_editor_login_password(
  p_login text,
  p_current_password text,
  p_new_password text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account midgas_private.editor_login_accounts%rowtype;
begin
  select * into account
  from midgas_private.editor_login_accounts
  where login = lower(btrim(p_login))
    and auth_user_id = p_user_id;

  if not found or account.password_hash <> extensions.crypt(p_current_password, account.password_hash) then
    return false;
  end if;

  update midgas_private.editor_login_accounts
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12)),
      updated_at = now()
  where login = account.login;

  return true;
end;
$$;

revoke all on function public.verify_editor_credentials(text, text, text) from public, anon, authenticated;
revoke all on function public.bind_editor_auth_user(text, uuid) from public, anon, authenticated;
revoke all on function public.change_editor_login_password(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.verify_editor_credentials(text, text, text) to service_role;
grant execute on function public.bind_editor_auth_user(text, uuid) to service_role;
grant execute on function public.change_editor_login_password(text, text, text, uuid) to service_role;

create or replace function midgas_private.enforce_record_access_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if not (select midgas_private.has_editor_role('limited')) then
    raise exception 'Editor access is required.' using errcode = '42501';
  end if;
  if new.deleted_at is distinct from old.deleted_at
     and not (select midgas_private.has_editor_role('full')) then
    raise exception 'Full editor access is required to delete or restore cards.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function midgas_private.enforce_record_access_level() from public, anon, authenticated;
drop trigger if exists records_enforce_access_level on public.records;
create trigger records_enforce_access_level
before update on public.records
for each row execute function midgas_private.enforce_record_access_level();

drop policy if exists relationships_editors_delete on public.relationships;
create policy relationships_full_delete on public.relationships
for delete to authenticated
using ((select midgas_private.has_editor_role('full')));

drop policy if exists board_nodes_editor_delete on public.board_nodes;
create policy board_nodes_full_delete on public.board_nodes
for delete to authenticated
using ((select midgas_private.has_editor_role('full')));

drop policy if exists board_edges_editor_delete on public.board_edges;
create policy board_edges_full_delete on public.board_edges
for delete to authenticated
using ((select midgas_private.has_editor_role('full')));

drop policy if exists board_positions_editor_delete on public.board_positions;
create policy board_positions_full_delete on public.board_positions
for delete to authenticated
using ((select midgas_private.has_editor_role('full')));

drop policy if exists site_settings_owner_update on public.site_settings;
create policy site_settings_admin_update on public.site_settings
for update to authenticated
using ((select midgas_private.has_editor_role('admin')))
with check ((select midgas_private.has_editor_role('admin')));
