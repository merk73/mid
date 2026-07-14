create table public.site_settings (
  id text primary key,
  maintenance_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.site_settings (id, maintenance_enabled)
values ('global', false)
on conflict (id) do nothing;

create table public.change_feed (
  id bigint generated always as identity primary key,
  audit_id bigint unique references public.audit_log(id) on delete cascade,
  action text not null,
  record_type text,
  record_code text,
  record_name text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index change_feed_occurred_at_idx on public.change_feed (occurred_at desc);

alter table public.site_settings enable row level security;
alter table public.change_feed enable row level security;

create policy site_settings_public_read on public.site_settings
for select to anon, authenticated using (true);

create policy site_settings_owner_update on public.site_settings
for update to authenticated
using (
  exists (
    select 1
    from public.editor_members member
    join auth.users account on account.id = member.user_id
    where member.user_id = (select auth.uid())
      and member.role = any (array['editor'::text, 'admin'::text])
      and member.approved_at is not null
      and lower(account.email::text) = 'habkraihistory@gmail.com'
  )
)
with check (
  id = 'global'
  and exists (
    select 1
    from public.editor_members member
    join auth.users account on account.id = member.user_id
    where member.user_id = (select auth.uid())
      and member.role = any (array['editor'::text, 'admin'::text])
      and member.approved_at is not null
      and lower(account.email::text) = 'habkraihistory@gmail.com'
  )
);

create policy change_feed_public_read on public.change_feed
for select to anon, authenticated using (true);

grant select on public.site_settings, public.change_feed to anon, authenticated;
grant update (maintenance_enabled, updated_at, updated_by) on public.site_settings to authenticated;

create or replace function midgas_private.publish_audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb := coalesce(new.after_data, new.before_data, '{}'::jsonb);
  source_uuid uuid;
  target_uuid uuid;
  source_code text;
  target_code text;
begin
  if new.entity_type = 'record' then
    insert into public.change_feed (
      audit_id, action, record_type, record_code, record_name, details, occurred_at
    ) values (
      new.id,
      new.action,
      nullif(payload->>'record_type', ''),
      nullif(payload->>'record_code', ''),
      nullif(payload->'content'->>'name', ''),
      jsonb_build_object('entity', 'record'),
      new.occurred_at
    )
    on conflict (audit_id) do nothing;
  elsif new.entity_type = 'relationship' then
    source_uuid := nullif(payload->>'source_id', '')::uuid;
    target_uuid := nullif(payload->>'target_id', '')::uuid;
    select record_code into source_code from public.records where id = source_uuid;
    select record_code into target_code from public.records where id = target_uuid;
    insert into public.change_feed (audit_id, action, details, occurred_at)
    values (
      new.id,
      new.action,
      jsonb_build_object('entity', 'relationship', 'source', source_code, 'target', target_code),
      new.occurred_at
    )
    on conflict (audit_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger audit_log_publish_change
after insert on public.audit_log
for each row execute function midgas_private.publish_audit_change();

insert into public.change_feed (audit_id, action, record_type, record_code, record_name, details, occurred_at)
select
  log.id,
  log.action,
  nullif(coalesce(log.after_data, log.before_data)->>'record_type', ''),
  nullif(coalesce(log.after_data, log.before_data)->>'record_code', ''),
  nullif(coalesce(log.after_data, log.before_data)->'content'->>'name', ''),
  jsonb_build_object('entity', log.entity_type),
  log.occurred_at
from public.audit_log log
where log.entity_type = 'record'
on conflict (audit_id) do nothing;

insert into public.change_feed (audit_id, action, details, occurred_at)
select
  log.id,
  log.action,
  jsonb_build_object(
    'entity', 'relationship',
    'source', source_record.record_code,
    'target', target_record.record_code
  ),
  log.occurred_at
from public.audit_log log
left join public.records source_record
  on source_record.id = nullif(coalesce(log.after_data, log.before_data)->>'source_id', '')::uuid
left join public.records target_record
  on target_record.id = nullif(coalesce(log.after_data, log.before_data)->>'target_id', '')::uuid
where log.entity_type = 'relationship'
on conflict (audit_id) do nothing;
