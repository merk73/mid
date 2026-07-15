create extension if not exists pgcrypto with schema extensions;

create table if not exists public.site_access_credentials (
  login text primary key,
  password_hash text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_access_sessions (
  token_hash text primary key,
  login text not null references public.site_access_credentials(login) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.site_access_attempts (
  attempt_key text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);

create index if not exists site_access_sessions_expires_at_idx
  on public.site_access_sessions (expires_at);

alter table public.site_access_credentials enable row level security;
alter table public.site_access_sessions enable row level security;
alter table public.site_access_attempts enable row level security;

revoke all on table public.site_access_credentials from anon, authenticated;
revoke all on table public.site_access_sessions from anon, authenticated;
revoke all on table public.site_access_attempts from anon, authenticated;

create or replace function public.verify_site_access_password(p_login text, p_password text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (
      select active and password_hash = extensions.crypt(p_password, password_hash)
      from public.site_access_credentials
      where login = lower(trim(p_login))
    ),
    false
  );
$$;

revoke all on function public.verify_site_access_password(text, text) from public, anon, authenticated;
grant execute on function public.verify_site_access_password(text, text) to service_role;

insert into public.site_access_credentials (login, password_hash, active)
values (
  'midgas',
  '$2a$12$AkW58o8XKPsJKok4Wd2Vduetf03ZNQ7DHv5eLI4kKhACWLsUrHxbW',
  true
)
on conflict (login) do update
set password_hash = excluded.password_hash,
    active = excluded.active,
    updated_at = now();
