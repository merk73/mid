update public.records
set content = content || jsonb_build_object(
  'threatLevel', least(5, greatest(1, coalesce(
    nullif(content ->> 'threatLevel', '')::integer,
    nullif((regexp_match(content::text, 'T([1-5])'))[1], '')::integer,
    1
  ))),
  'accessLevel', least(5, greatest(1, coalesce(
    nullif(content ->> 'accessLevel', '')::integer,
    nullif((regexp_match(content::text, 'D([1-5])'))[1], '')::integer,
    1
  )))
), updated_at = now();
