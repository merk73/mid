-- Repair the six original homepage quotes that were imported with a double UTF-8 conversion.
-- Match the stable ordinal suffix instead of generated row IDs.
update public.editorial_entries
set
  title = case right(coalesce(metadata ->> 'source', title), 2)
    when '01' then 'Случайная запись 01'
    when '02' then 'Случайная запись 02'
    when '03' then 'Случайная запись 03'
    when '04' then 'Случайная запись 04'
    when '05' then 'Случайная запись 05'
    when '06' then 'Случайная запись 06'
  end,
  body = case right(coalesce(metadata ->> 'source', title), 2)
    when '01' then 'Я целый месяц жил на Урале. Там была строительная площадка. Волшебный город для сериала. Там и играл в пинг-понг. Ещё приезжал на КАМАЗе Баста.'
    when '02' then 'Мохнатая ОПГ не выкупает прикола чилить целый день.'
    when '03' then 'Видимо, началось.'
    when '04' then 'Эта дрянь выползла из недр черемушкинской сточной канавы, и теперь мы не знаем, куда его деть.'
    when '05' then 'Зачем они светофоры ускорили?'
    when '06' then 'День рождения только через пару дней, а Ярослав уже начал поздравлять.'
  end,
  metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{source}',
    to_jsonb('СЛУЧАЙНАЯ ЗАПИСЬ / ' || right(coalesce(metadata ->> 'source', title), 2))
  )
where entry_type = 'quote'
  and deleted_at is null
  and right(coalesce(metadata ->> 'source', title), 2) in ('01', '02', '03', '04', '05', '06');
