-- Delete a visual edge and its dossier relationship in one transaction.
create or replace function public.delete_board_edge(
  p_source_key text,
  p_target_key text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  canonical_source text := least(btrim(p_source_key), btrim(p_target_key));
  canonical_target text := greatest(btrim(p_source_key), btrim(p_target_key));
  source_record_id uuid;
  target_record_id uuid;
  affected_count integer := 0;
  changed boolean := false;
begin
  if not (select midgas_private.has_editor_role('full')) then
    raise exception 'Full editor access is required.' using errcode = '42501';
  end if;

  if canonical_source is null
     or canonical_target is null
     or canonical_source = ''
     or canonical_target = ''
     or canonical_source = canonical_target then
    raise exception 'Two different board nodes are required.' using errcode = '22023';
  end if;

  delete from public.board_edges
  where source_key = canonical_source
    and target_key = canonical_target;
  get diagnostics affected_count = row_count;
  changed := affected_count > 0;

  select record.id
  into source_record_id
  from public.records as record
  where record.deleted_at is null
    and record.record_type = split_part(canonical_source, ':', 1)
    and record.record_code = split_part(canonical_source, ':', 2)
  limit 1;

  select record.id
  into target_record_id
  from public.records as record
  where record.deleted_at is null
    and record.record_type = split_part(canonical_target, ':', 1)
    and record.record_code = split_part(canonical_target, ':', 2)
  limit 1;

  if source_record_id is not null and target_record_id is not null then
    delete from public.relationships
    where (source_id = source_record_id and target_id = target_record_id)
       or (source_id = target_record_id and target_id = source_record_id);
    get diagnostics affected_count = row_count;
    changed := changed or affected_count > 0;
  end if;

  return changed;
end;
$$;

revoke all on function public.delete_board_edge(text, text) from public, anon;
grant execute on function public.delete_board_edge(text, text) to authenticated;
