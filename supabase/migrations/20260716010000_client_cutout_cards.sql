with cutouts(record_code, card_image) as (
  values
    ('MID-C-0001', 'assets/clients/cutouts/client-0001.png'),
    ('MID-C-0002', 'assets/clients/cutouts/client-0002.png'),
    ('MID-C-0003', 'assets/clients/cutouts/client-0003.png'),
    ('MID-C-0005', 'assets/clients/cutouts/client-0005.png'),
    ('MID-C-0006', 'assets/clients/cutouts/client-0006.png'),
    ('MID-C-0015', 'assets/clients/cutouts/client-0019.png'),
    ('MID-C-0016', 'assets/clients/cutouts/client-0022.png'),
    ('MID-C-0017', 'assets/clients/cutouts/client-0023.png'),
    ('MID-C-0023', 'assets/clients/cutouts/client-0029.png')
)
update public.records as records
set content = jsonb_set(
  jsonb_set(records.content, '{cardImage}', to_jsonb(cutouts.card_image), true),
  '{imageFit}',
  '"contain"'::jsonb,
  true
),
updated_at = now()
from cutouts
where records.record_code = cutouts.record_code
  and records.record_type = 'client';
