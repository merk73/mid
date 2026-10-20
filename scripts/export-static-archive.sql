-- Read-only, consistent content export. Run in MIDGAS SQL Editor, save the
-- archive_export JSON cell outside the repository. No Auth users, password
-- hashes, session tokens, or API credentials are included.
select jsonb_build_object(
  'project_ref', 'skvwaovkkoxqfwkcpuvh',
  'exported_at', now(),
  'records', (select coalesce(jsonb_agg(to_jsonb(r) - 'created_by' - 'updated_by'), '[]'::jsonb) from public.records r where r.deleted_at is null),
  'relationships', (select coalesce(jsonb_agg(to_jsonb(r) - 'created_by' - 'updated_by'), '[]'::jsonb) from public.relationships r),
  'editorial_entries', (select coalesce(jsonb_agg(to_jsonb(r) - 'created_by' - 'updated_by'), '[]'::jsonb) from public.editorial_entries r),
  'board_nodes', (select coalesce(jsonb_agg(to_jsonb(r) - 'created_by' - 'updated_by'), '[]'::jsonb) from public.board_nodes r),
  'board_edges', (select coalesce(jsonb_agg(to_jsonb(r) - 'created_by' - 'updated_by'), '[]'::jsonb) from public.board_edges r),
  'board_positions', (select coalesce(jsonb_agg(to_jsonb(r) - 'created_by' - 'updated_by'), '[]'::jsonb) from public.board_positions r),
  'site_settings', (select coalesce(jsonb_agg(to_jsonb(r) - 'created_by' - 'updated_by'), '[]'::jsonb) from public.site_settings r)
) as archive_export;
