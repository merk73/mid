-- Unified mandatory account model for the public site and editorial tools.
-- Authorization is sourced from public.account_members and never user_metadata.

create extension if not exists pgcrypto;

create table if not exists public.account_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login text not null unique check (login = lower(login) and login ~ '^[a-z0-9_-]{3,40}$'),
  role text not null check (role in ('viewer', 'editor', 'admin')),
  display_name text not null default '',
  avatar_path text,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_members enable row level security;
grant select on public.account_members to authenticated;
revoke all on public.account_members from anon;

create schema if not exists midgas_private;

create table if not exists midgas_private.account_login_credentials (
  login text primary key check (login = lower(login) and login ~ '^[a-z0-9_-]{3,40}$'),
  password_hash text not null,
  internal_email text not null unique,
  access_role text not null check (access_role in ('viewer', 'editor', 'admin')),
  auth_user_id uuid unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists midgas_private.account_login_attempts (
  login text not null,
  ip_hash text not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists account_login_attempts_guard_idx
  on midgas_private.account_login_attempts (login, ip_hash, attempted_at desc);

revoke all on schema midgas_private from public, anon, authenticated;
revoke all on all tables in schema midgas_private from public, anon, authenticated;

insert into midgas_private.account_login_credentials (
  login, password_hash, internal_email, access_role, auth_user_id, active
)
values
  ('ashtar', crypt('0152', gen_salt('bf', 12)), 'ashtar@accounts.midgas.ru', 'viewer', null, true),
  (
    'zahur',
    crypt('0167', gen_salt('bf', 12)),
    'zahur@accounts.midgas.ru',
    'editor',
    (select auth_user_id from midgas_private.editor_login_accounts where login = 'zahur'),
    true
  ),
  ('kaba', crypt('6070', gen_salt('bf', 12)), 'kaba@accounts.midgas.ru', 'admin', null, true)
on conflict (login) do update
set password_hash = excluded.password_hash,
    internal_email = excluded.internal_email,
    access_role = excluded.access_role,
    auth_user_id = coalesce(excluded.auth_user_id, midgas_private.account_login_credentials.auth_user_id),
    active = true,
    updated_at = now();

insert into public.account_members (user_id, login, role, display_name, approved_at)
select auth_user_id, login, access_role, initcap(login), now()
from midgas_private.account_login_credentials
where auth_user_id is not null
on conflict (user_id) do update
set login = excluded.login,
    role = excluded.role,
    display_name = excluded.display_name,
    approved_at = excluded.approved_at,
    updated_at = now();

create or replace function midgas_private.has_account_role(required_role text default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.account_members as member
    where member.user_id = (select auth.uid())
      and case required_role
        when 'admin' then member.role = 'admin'
        when 'editor' then member.role in ('editor', 'admin')
        else member.role in ('viewer', 'editor', 'admin')
      end
  );
$$;

revoke all on function midgas_private.has_account_role(text) from public, anon, authenticated;

-- Compatibility for existing record/board RPC functions during the redesign.
create or replace function midgas_private.has_editor_role(required_role text default 'limited')
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when required_role = 'admin' then midgas_private.has_account_role('admin')
    else midgas_private.has_account_role('editor')
  end;
$$;

revoke all on function midgas_private.has_editor_role(text) from public, anon, authenticated;

create or replace function public.verify_account_credentials(
  p_login text,
  p_password text,
  p_ip_hash text
)
returns table (
  login text,
  internal_email text,
  access_role text,
  auth_user_id uuid,
  is_valid boolean,
  is_locked boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, midgas_private
as $$
declare
  normalized_login text := lower(trim(coalesce(p_login, '')));
  account midgas_private.account_login_credentials%rowtype;
  recent_failures integer;
begin
  delete from midgas_private.account_login_attempts
  where attempted_at < now() - interval '24 hours';

  select count(*) into recent_failures
  from midgas_private.account_login_attempts as attempt
  where attempt.login = normalized_login
    and attempt.ip_hash = p_ip_hash
    and attempt.success = false
    and attempt.attempted_at > now() - interval '15 minutes';

  if recent_failures >= 5 then
    return query select normalized_login, null::text, null::text, null::uuid, false, true;
    return;
  end if;

  select * into account
  from midgas_private.account_login_credentials as credential
  where credential.login = normalized_login
    and credential.active = true;

  if account.login is null or account.password_hash <> extensions.crypt(coalesce(p_password, ''), account.password_hash) then
    insert into midgas_private.account_login_attempts (login, ip_hash, success)
    values (normalized_login, p_ip_hash, false);
    return query select normalized_login, null::text, null::text, null::uuid, false, false;
    return;
  end if;

  insert into midgas_private.account_login_attempts (login, ip_hash, success)
  values (normalized_login, p_ip_hash, true);

  return query
  select account.login, account.internal_email, account.access_role, account.auth_user_id, true, false;
end;
$$;

create or replace function public.bind_account_auth_user(p_login text, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, midgas_private
as $$
declare
  normalized_login text := lower(trim(coalesce(p_login, '')));
  assigned_role text;
begin
  update midgas_private.account_login_credentials
  set auth_user_id = p_user_id,
      updated_at = now()
  where login = normalized_login
    and active = true
  returning access_role into assigned_role;

  if assigned_role is null then
    raise exception 'Unknown account login.' using errcode = '22023';
  end if;

  insert into public.account_members (user_id, login, role, display_name, approved_at)
  values (p_user_id, normalized_login, assigned_role, initcap(normalized_login), now())
  on conflict (user_id) do update
  set login = excluded.login,
      role = excluded.role,
      approved_at = excluded.approved_at,
      updated_at = now();

  return assigned_role;
end;
$$;

revoke all on function public.verify_account_credentials(text, text, text) from public, anon, authenticated;
revoke all on function public.bind_account_auth_user(text, uuid) from public, anon, authenticated;
grant execute on function public.verify_account_credentials(text, text, text) to service_role;
grant execute on function public.bind_account_auth_user(text, uuid) to service_role;

drop policy if exists account_members_read_self on public.account_members;
create policy account_members_read_self on public.account_members
for select to authenticated
using ((select auth.uid()) = user_id);

-- Mandatory account access: no content reads through the anon role.
revoke all on public.records, public.relationships, public.record_versions,
  public.audit_log, public.site_settings, public.change_feed,
  public.board_nodes, public.board_edges, public.board_positions from anon;

grant select on public.records, public.relationships, public.site_settings,
  public.change_feed, public.board_nodes, public.board_edges, public.board_positions to authenticated;

drop policy if exists records_public_read_active on public.records;
drop policy if exists records_editors_read_all on public.records;
create policy records_account_read on public.records
for select to authenticated
using (deleted_at is null or (select midgas_private.has_account_role('editor')));

drop policy if exists relationships_public_read_active on public.relationships;
drop policy if exists relationships_editors_read_all on public.relationships;
create policy relationships_account_read on public.relationships
for select to authenticated
using (
  (select midgas_private.has_account_role('editor'))
  or (
    exists (select 1 from public.records source where source.id = source_id and source.deleted_at is null)
    and exists (select 1 from public.records target where target.id = target_id and target.deleted_at is null)
  )
);

drop policy if exists board_nodes_public_read on public.board_nodes;
create policy board_nodes_account_read on public.board_nodes
for select to authenticated using ((select midgas_private.has_account_role('viewer')));

drop policy if exists board_edges_public_read on public.board_edges;
create policy board_edges_account_read on public.board_edges
for select to authenticated using ((select midgas_private.has_account_role('viewer')));

drop policy if exists board_positions_public_read on public.board_positions;
create policy board_positions_account_read on public.board_positions
for select to authenticated using ((select midgas_private.has_account_role('viewer')));

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_account_read on public.site_settings
for select to authenticated using ((select midgas_private.has_account_role('viewer')));

drop policy if exists records_editors_insert on public.records;
create policy records_editor_insert on public.records
for insert to authenticated
with check ((select midgas_private.has_account_role('editor')) and created_by = (select auth.uid()));

drop policy if exists records_editors_update on public.records;
create policy records_editor_update on public.records
for update to authenticated
using ((select midgas_private.has_account_role('editor')))
with check ((select midgas_private.has_account_role('editor')));

drop policy if exists relationships_editors_insert on public.relationships;
create policy relationships_editor_insert on public.relationships
for insert to authenticated
with check ((select midgas_private.has_account_role('editor')) and created_by = (select auth.uid()));

drop policy if exists relationships_full_delete on public.relationships;
create policy relationships_editor_delete on public.relationships
for delete to authenticated
using ((select midgas_private.has_account_role('editor')));

drop policy if exists site_settings_admin_update on public.site_settings;
create policy site_settings_admin_update on public.site_settings
for update to authenticated
using ((select midgas_private.has_account_role('admin')))
with check ((select midgas_private.has_account_role('admin')));

-- Remove obsolete credential access immediately. Old Auth users become harmless
-- because they no longer have membership and all policies use account_members.
delete from public.editor_members;
delete from midgas_private.editor_login_accounts;
