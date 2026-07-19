-- Canonical dossier content. Legacy alias/cardType keys are removed from storage;
-- the frontend keeps read-only compatibility while cached clients refresh.
update public.records
set content = (
  content
  - 'alias'
  - 'cardType'
  - 'type'
) || jsonb_build_object(
  'caption', coalesce(
    nullif(trim(content ->> 'caption'), ''),
    nullif(trim(content ->> 'alias'), ''),
    nullif(trim(content ->> 'cardType'), ''),
    ''
  ),
  'isPublished', coalesce((content ->> 'isPublished')::boolean, true),
  'sections', case when jsonb_typeof(content -> 'sections') = 'array' then content -> 'sections' else '[]'::jsonb end,
  'editorRelations', case when jsonb_typeof(content -> 'editorRelations') = 'array' then content -> 'editorRelations' else '[]'::jsonb end
), updated_at = now()
where deleted_at is null;
