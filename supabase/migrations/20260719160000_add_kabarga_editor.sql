insert into midgas_private.account_login_credentials (
  login,
  password_hash,
  internal_email,
  access_role,
  auth_user_id,
  active
)
values (
  'kabarga',
  crypt('777', gen_salt('bf', 12)),
  'kabarga@accounts.midgas.ru',
  'editor',
  null,
  true
)
on conflict (login) do update
set password_hash = excluded.password_hash,
    internal_email = excluded.internal_email,
    access_role = 'editor',
    active = true,
    updated_at = now();
