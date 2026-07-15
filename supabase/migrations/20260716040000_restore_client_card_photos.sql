update public.records
set content = (content - 'imageFit') || jsonb_build_object('cardImage', content -> 'image'),
    updated_at = now()
where record_type = 'client'
  and record_code in (
    'MID-C-0001',
    'MID-C-0002',
    'MID-C-0003',
    'MID-C-0005',
    'MID-C-0006',
    'MID-C-0015',
    'MID-C-0016',
    'MID-C-0017',
    'MID-C-0023'
  )
  and nullif(content ->> 'image', '') is not null;
