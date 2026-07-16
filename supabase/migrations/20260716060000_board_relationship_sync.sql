-- Keep the visual board edge and dossier relationship in one transaction.
create or replace function public.create_board_edge(
  p_source_key text,
  p_target_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  canonical_source text := least(btrim(p_source_key), btrim(p_target_key));
  canonical_target text := greatest(btrim(p_source_key), btrim(p_target_key));
  edge_id uuid;
  source_record_id uuid;
  target_record_id uuid;
begin
  if not (select midgas_private.has_editor_role('editor')) then
    raise exception 'Editor access is required.' using errcode = '42501';
  end if;

  if canonical_source is null
     or canonical_target is null
     or canonical_source = ''
     or canonical_target = ''
     or canonical_source = canonical_target then
    raise exception 'Two different board nodes are required.' using errcode = '22023';
  end if;

  insert into public.board_edges (source_key, target_key)
  values (canonical_source, canonical_target)
  on conflict (source_key, target_key) do nothing
  returning id into edge_id;

  if edge_id is null then
    select edge.id
    into edge_id
    from public.board_edges as edge
    where edge.source_key = canonical_source
      and edge.target_key = canonical_target;
  end if;

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
    insert into public.relationships (source_id, target_id)
    values (source_record_id, target_record_id)
    on conflict do nothing;
  end if;

  return edge_id;
end;
$$;

revoke all on function public.create_board_edge(text, text) from public, anon;
grant execute on function public.create_board_edge(text, text) to authenticated;

-- Repair older record-to-record edges that existed only on the board.
insert into public.relationships (source_id, target_id)
select source_record.id, target_record.id
from public.board_edges as edge
join public.records as source_record
  on source_record.deleted_at is null
 and source_record.record_type = split_part(edge.source_key, ':', 1)
 and source_record.record_code = split_part(edge.source_key, ':', 2)
join public.records as target_record
  on target_record.deleted_at is null
 and target_record.record_type = split_part(edge.target_key, ':', 1)
 and target_record.record_code = split_part(edge.target_key, ':', 2)
where source_record.id <> target_record.id
on conflict do nothing;
