-- Attach the database-managed record version to public change-feed events so
-- approved editors can roll a specific content change back from the UI.

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
      jsonb_build_object(
        'entity', 'record',
        'version', nullif(payload->>'version', '')::integer
      ),
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

revoke all on function midgas_private.publish_audit_change() from public, anon, authenticated;

update public.change_feed as feed
set details = coalesce(feed.details, '{}'::jsonb) || jsonb_build_object(
  'version', nullif(coalesce(log.after_data, log.before_data)->>'version', '')::integer
)
from public.audit_log as log
where feed.audit_id = log.id
  and feed.action like 'record_%'
  and nullif(coalesce(log.after_data, log.before_data)->>'version', '') is not null;
