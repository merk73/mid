update public.account_members
set avatar_path = null, updated_at = now()
where avatar_path is not null;

drop function if exists public.set_account_avatar(text);
drop policy if exists "account_avatars_owner_insert" on storage.objects;
drop policy if exists "account_avatars_owner_update" on storage.objects;
drop policy if exists "account_avatars_owner_delete" on storage.objects;
drop policy if exists "account_avatars_public_read" on storage.objects;

update storage.buckets
set public = false
where id = 'account-avatars';
