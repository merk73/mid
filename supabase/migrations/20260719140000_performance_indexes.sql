create index if not exists editorial_entries_created_by_idx on public.editorial_entries (created_by);
create index if not exists editorial_entries_updated_by_idx on public.editorial_entries (updated_by);
create index if not exists site_settings_updated_by_idx on public.site_settings (updated_by);

alter table midgas_private.account_login_attempts
  add column if not exists id bigint generated always as identity;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'midgas_private.account_login_attempts'::regclass
      and contype = 'p'
  ) then
    alter table midgas_private.account_login_attempts
      add constraint account_login_attempts_pkey primary key (id);
  end if;
end;
$$;
