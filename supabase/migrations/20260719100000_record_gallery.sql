update public.records
set content = content || jsonb_build_object(
  'gallery', case
    when jsonb_typeof(content -> 'gallery') = 'array' then (
      select coalesce(jsonb_agg(value), '[]'::jsonb)
      from (select value from jsonb_array_elements(content -> 'gallery') with ordinality as item(value, position) order by position limit 9) limited
    )
    else '[]'::jsonb
  end
), updated_at = now();
