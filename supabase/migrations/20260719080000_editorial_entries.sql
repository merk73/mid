create table if not exists public.editorial_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('location', 'glossary', 'quote')),
  title text not null check (char_length(trim(title)) between 1 and 180),
  body text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists editorial_entries_type_status_idx
  on public.editorial_entries (entry_type, is_published, updated_at desc)
  where deleted_at is null;

alter table public.editorial_entries enable row level security;
revoke all on public.editorial_entries from anon;
grant select, insert, update, delete on public.editorial_entries to authenticated;

create policy editorial_entries_account_read on public.editorial_entries
for select to authenticated
using (
  (deleted_at is null and is_published = true)
  or (select midgas_private.has_account_role('editor'))
);

create policy editorial_entries_editor_insert on public.editorial_entries
for insert to authenticated
with check (
  (select midgas_private.has_account_role('editor'))
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy editorial_entries_editor_update on public.editorial_entries
for update to authenticated
using ((select midgas_private.has_account_role('editor')))
with check (
  (select midgas_private.has_account_role('editor'))
  and updated_by = (select auth.uid())
);

create policy editorial_entries_admin_delete on public.editorial_entries
for delete to authenticated
using ((select midgas_private.has_account_role('admin')));

insert into public.editorial_entries (entry_type, title, body, metadata, created_by, updated_by)
select 'quote', seed.title, seed.body, jsonb_build_object('source', seed.source), member.user_id, member.user_id
from (values
  ('Случайная запись 01', 'Я целый месяц жил на Урале. Там была строительная площадка. Волшебный город для сериала. Там и играл в пинг-понг. Ещё приезжал на КАМАЗе Баста.', 'СЛУЧАЙНАЯ ЗАПИСЬ / 01'),
  ('Случайная запись 02', 'Мохнатая ОПГ не выкупает прикола чилить целый день.', 'СЛУЧАЙНАЯ ЗАПИСЬ / 02'),
  ('Случайная запись 03', 'Видимо, началось.', 'СЛУЧАЙНАЯ ЗАПИСЬ / 03'),
  ('Случайная запись 04', 'Эта дрянь выползла из недр черемушкинской сточной канавы, и теперь мы не знаем, куда его деть.', 'СЛУЧАЙНАЯ ЗАПИСЬ / 04'),
  ('Случайная запись 05', 'Зачем они светофоры ускорили?', 'СЛУЧАЙНАЯ ЗАПИСЬ / 05'),
  ('Случайная запись 06', 'День рождения только через пару дней, а Ярослав уже начал поздравлять.', 'СЛУЧАЙНАЯ ЗАПИСЬ / 06')
) as seed(title, body, source)
cross join lateral (
  select user_id from public.account_members where role = 'admin' order by approved_at limit 1
) as member
where not exists (select 1 from public.editorial_entries where entry_type = 'quote');
