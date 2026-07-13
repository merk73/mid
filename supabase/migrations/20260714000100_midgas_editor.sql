-- MIDGAS editor backend template.
-- Prepared for Supabase/Postgres on 2026-07-14; the project is not linked yet.
-- Record numbers are sequence-backed and are intentionally never reused.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists midgas_private;
revoke all on schema midgas_private from public, anon, authenticated;

create sequence if not exists public.client_record_no_seq as bigint start with 1 increment by 1 no cycle;
create sequence if not exists public.anomaly_record_no_seq as bigint start with 1 increment by 1 no cycle;
create sequence if not exists public.incident_record_no_seq as bigint start with 1 increment by 1 no cycle;

create table public.editor_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'pending'
    check (role in ('pending', 'editor', 'admin')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint editor_members_approval_state_check check (
    (role = 'pending' and approved_at is null and approved_by is null)
    or (role in ('editor', 'admin') and approved_at is not null)
  )
);

create table public.records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null
    check (record_type in ('client', 'anomaly', 'incident')),
  record_no bigint not null check (record_no > 0),
  record_code text not null,
  content jsonb not null default '{}'::jsonb
    check (jsonb_typeof(content) = 'object'),
  cover_path text,
  publication_snapshot jsonb not null,
  published_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint records_type_number_unique unique (record_type, record_no),
  constraint records_code_unique unique (record_code)
);

create table public.relationships (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.records(id) on delete restrict,
  target_id uuid not null references public.records(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint relationships_no_self_link check (source_id <> target_id)
);

create table public.record_versions (
  id bigint generated always as identity primary key,
  record_id uuid not null references public.records(id) on delete restrict,
  version integer not null check (version > 0),
  change_kind text not null
    check (change_kind in ('published', 'updated', 'soft_deleted', 'restored')),
  snapshot jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint record_versions_record_version_unique unique (record_id, version)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null check (entity_type in ('record', 'relationship')),
  entity_key text not null,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);

create index editor_members_approved_by_idx
  on public.editor_members (approved_by) where approved_by is not null;
create index records_active_type_no_idx
  on public.records (record_type, record_no desc) where deleted_at is null;
create index records_deleted_at_idx
  on public.records (deleted_at) where deleted_at is not null;
create index records_created_by_idx on public.records (created_by) where created_by is not null;
create index records_updated_by_idx on public.records (updated_by) where updated_by is not null;
create index records_content_gin_idx on public.records using gin (content jsonb_path_ops);
create index relationships_source_id_idx on public.relationships (source_id);
create index relationships_target_id_idx on public.relationships (target_id);
create unique index relationships_undirected_unique_idx
  on public.relationships (least(source_id, target_id), greatest(source_id, target_id));
create index relationships_created_by_idx
  on public.relationships (created_by) where created_by is not null;
create index record_versions_record_changed_idx
  on public.record_versions (record_id, changed_at desc);
create index record_versions_changed_by_idx
  on public.record_versions (changed_by) where changed_by is not null;
create index audit_log_entity_idx
  on public.audit_log (entity_type, entity_key, occurred_at desc);
create index audit_log_actor_idx
  on public.audit_log (actor_id, occurred_at desc) where actor_id is not null;

-- This helper is outside exposed schemas. It reads only the caller's own
-- membership and does not rely on user-editable JWT metadata.
create or replace function midgas_private.has_editor_role(required_role text default 'editor')
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
        else member.role in ('editor', 'admin')
      end
  );
$$;

revoke all on function midgas_private.has_editor_role(text) from public, anon;
grant usage on schema midgas_private to authenticated;
grant execute on function midgas_private.has_editor_role(text) to authenticated;

create or replace function midgas_private.prepare_editor_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'editor member identity is immutable' using errcode = '22023';
  end if;

  if new.role is distinct from old.role then
    if new.role = 'pending' then
      new.approved_at := null;
      new.approved_by := null;
    else
      new.approved_at := clock_timestamp();
      new.approved_by := (select auth.uid());
    end if;
  else
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;

  return new;
end;
$$;

revoke all on function midgas_private.prepare_editor_member_update() from public, anon, authenticated;

-- Every confirmed Supabase account starts without editor privileges. The owner
-- later promotes selected users to editor/admin from the Dashboard or admin UI.
create or replace function midgas_private.create_pending_editor_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.editor_members (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function midgas_private.create_pending_editor_member() from public, anon, authenticated;

create trigger auth_user_create_pending_editor_member
after insert on auth.users
for each row execute function midgas_private.create_pending_editor_member();

create trigger editor_members_prepare_update
before update on public.editor_members
for each row execute function midgas_private.prepare_editor_member_update();

create or replace function midgas_private.prepare_record_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefix text;
begin
  new.id := coalesce(new.id, gen_random_uuid());

  case new.record_type
    when 'client' then
      new.record_no := nextval('public.client_record_no_seq'::regclass);
      prefix := 'C';
    when 'anomaly' then
      new.record_no := nextval('public.anomaly_record_no_seq'::regclass);
      prefix := 'A';
    when 'incident' then
      new.record_no := nextval('public.incident_record_no_seq'::regclass);
      prefix := 'I';
    else
      raise exception 'unsupported record type: %', new.record_type using errcode = '22023';
  end case;

  new.record_code := 'MID-' || prefix || '-' || lpad(new.record_no::text, 4, '0');
  new.version := 1;
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := new.created_at;
  new.published_at := coalesce(new.published_at, new.created_at);
  new.created_by := coalesce(new.created_by, (select auth.uid()));
  new.updated_by := new.created_by;
  new.deleted_at := null;
  new.publication_snapshot := jsonb_build_object(
    'id', new.id,
    'record_type', new.record_type,
    'record_no', new.record_no,
    'record_code', new.record_code,
    'content', new.content,
    'cover_path', new.cover_path
  );

  return new;
end;
$$;

revoke all on function midgas_private.prepare_record_insert() from public, anon, authenticated;

create or replace function midgas_private.prepare_record_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.record_type is distinct from old.record_type
     or new.record_no is distinct from old.record_no
     or new.record_code is distinct from old.record_code
     or new.publication_snapshot is distinct from old.publication_snapshot
     or new.published_at is distinct from old.published_at
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'record identity and publication fields are immutable' using errcode = '22023';
  end if;

  if new.version is distinct from old.version then
    raise exception 'record version is managed by the database' using errcode = '22023';
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_at := clock_timestamp();
  elsif old.deleted_at is not null and new.deleted_at is not null then
    new.deleted_at := old.deleted_at;
  end if;

  new.version := old.version + 1;
  new.updated_at := clock_timestamp();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

revoke all on function midgas_private.prepare_record_update() from public, anon, authenticated;

create trigger records_prepare_insert
before insert on public.records
for each row execute function midgas_private.prepare_record_insert();

create trigger records_prepare_update
before update on public.records
for each row execute function midgas_private.prepare_record_update();

create or replace function midgas_private.archive_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text;
  action_name text;
begin
  if tg_op = 'INSERT' then
    kind := 'published';
    action_name := 'record_created';
  elsif old.deleted_at is null and new.deleted_at is not null then
    kind := 'soft_deleted';
    action_name := 'record_soft_deleted';
  elsif old.deleted_at is not null and new.deleted_at is null then
    kind := 'restored';
    action_name := 'record_restored';
  else
    kind := 'updated';
    action_name := 'record_updated';
  end if;

  insert into public.record_versions (
    record_id, version, change_kind, snapshot, changed_by, changed_at
  ) values (
    new.id,
    new.version,
    kind,
    jsonb_build_object(
      'id', new.id,
      'record_type', new.record_type,
      'record_no', new.record_no,
      'record_code', new.record_code,
      'content', new.content,
      'cover_path', new.cover_path,
      'deleted_at', new.deleted_at
    ),
    (select auth.uid()),
    clock_timestamp()
  );

  insert into public.audit_log (
    actor_id, action, entity_type, entity_key, before_data, after_data
  ) values (
    (select auth.uid()),
    action_name,
    'record',
    new.id::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

revoke all on function midgas_private.archive_record_change() from public, anon, authenticated;

create trigger records_archive_change
after insert or update on public.records
for each row execute function midgas_private.archive_record_change();

create or replace function midgas_private.audit_relationship_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (
    actor_id, action, entity_type, entity_key, before_data, after_data
  ) values (
    (select auth.uid()),
    case when tg_op = 'INSERT' then 'relationship_created' else 'relationship_deleted' end,
    'relationship',
    coalesce(new.id, old.id)::text,
    case when tg_op = 'DELETE' then to_jsonb(old) else null end,
    case when tg_op = 'INSERT' then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function midgas_private.audit_relationship_change() from public, anon, authenticated;

create trigger relationships_audit_change
after insert or delete on public.relationships
for each row execute function midgas_private.audit_relationship_change();

alter table public.editor_members enable row level security;
alter table public.records enable row level security;
alter table public.relationships enable row level security;
alter table public.record_versions enable row level security;
alter table public.audit_log enable row level security;

create policy editor_members_read_own_or_admin
on public.editor_members for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select midgas_private.has_editor_role('admin'))
);

create policy editor_members_request_pending_or_admin
on public.editor_members for insert
to authenticated
with check (
  (
    user_id = (select auth.uid())
    and role = 'pending'
    and approved_at is null
    and approved_by is null
  )
  or (select midgas_private.has_editor_role('admin'))
);

create policy editor_members_admin_update
on public.editor_members for update
to authenticated
using ((select midgas_private.has_editor_role('admin')))
with check ((select midgas_private.has_editor_role('admin')));

create policy records_public_read_active
on public.records for select
to anon, authenticated
using (deleted_at is null);

create policy records_editors_read_all
on public.records for select
to authenticated
using ((select midgas_private.has_editor_role('editor')));

create policy records_editors_insert
on public.records for insert
to authenticated
with check (
  (select midgas_private.has_editor_role('editor'))
  and deleted_at is null
);

create policy records_editors_update
on public.records for update
to authenticated
using ((select midgas_private.has_editor_role('editor')))
with check ((select midgas_private.has_editor_role('editor')));

create policy relationships_public_read_active
on public.relationships for select
to anon, authenticated
using (
  exists (
    select 1 from public.records source_record
    where source_record.id = source_id and source_record.deleted_at is null
  )
  and exists (
    select 1 from public.records target_record
    where target_record.id = target_id and target_record.deleted_at is null
  )
);

create policy relationships_editors_read_all
on public.relationships for select
to authenticated
using ((select midgas_private.has_editor_role('editor')));

create policy relationships_editors_insert
on public.relationships for insert
to authenticated
with check ((select midgas_private.has_editor_role('editor')));

create policy relationships_editors_delete
on public.relationships for delete
to authenticated
using ((select midgas_private.has_editor_role('editor')));

create policy record_versions_editors_read
on public.record_versions for select
to authenticated
using ((select midgas_private.has_editor_role('editor')));

create policy audit_log_editors_read
on public.audit_log for select
to authenticated
using ((select midgas_private.has_editor_role('editor')));

-- New Supabase projects no longer auto-expose SQL-created tables (2026).
-- Keep grants explicit and pair every exposed table with RLS above.
grant usage on schema public to anon, authenticated, service_role;

revoke all on table public.editor_members from anon, authenticated;
revoke all on table public.records from anon, authenticated;
revoke all on table public.relationships from anon, authenticated;
revoke all on table public.record_versions from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;

grant select on table public.records, public.relationships to anon;
grant select on table public.records, public.relationships to authenticated;
grant select on table public.editor_members, public.record_versions, public.audit_log to authenticated;
grant insert (record_type, content, cover_path) on table public.records to authenticated;
grant update (content, cover_path, deleted_at) on table public.records to authenticated;
grant insert (source_id, target_id) on table public.relationships to authenticated;
grant delete on table public.relationships to authenticated;
grant insert (user_id) on table public.editor_members to authenticated;
grant update (role) on table public.editor_members to authenticated;

grant all privileges on table
  public.editor_members,
  public.records,
  public.relationships,
  public.record_versions,
  public.audit_log
to service_role;
grant usage, select, update on sequence
  public.client_record_no_seq,
  public.anomaly_record_no_seq,
  public.incident_record_no_seq,
  public.relationships_id_seq,
  public.record_versions_id_seq,
  public.audit_log_id_seq
to service_role;

-- Public bucket: files can be rendered by the static site, but listing and all
-- mutations still require an approved editor. Never expose a service-role key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'record-covers',
  'record-covers',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy record_covers_editor_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'record-covers'
  and (select midgas_private.has_editor_role('editor'))
);

create policy record_covers_editor_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'record-covers'
  and (select midgas_private.has_editor_role('editor'))
);

create policy record_covers_editor_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'record-covers'
  and (select midgas_private.has_editor_role('editor'))
)
with check (
  bucket_id = 'record-covers'
  and (select midgas_private.has_editor_role('editor'))
);

create policy record_covers_editor_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'record-covers'
  and (select midgas_private.has_editor_role('editor'))
);
