insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-avatars', 'account-avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "account_avatars_owner_insert" on storage.objects;
drop policy if exists "account_avatars_owner_update" on storage.objects;
drop policy if exists "account_avatars_owner_delete" on storage.objects;
drop policy if exists "account_avatars_public_read" on storage.objects;
create policy "account_avatars_owner_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'account-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "account_avatars_owner_update" on storage.objects for update to authenticated
using (bucket_id = 'account-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'account-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "account_avatars_owner_delete" on storage.objects for delete to authenticated
using (bucket_id = 'account-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "account_avatars_public_read" on storage.objects for select to public using (bucket_id = 'account-avatars');

create or replace function public.set_account_avatar(p_path text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_path text := trim(coalesce(p_path, ''));
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_path <> '' and v_path not like v_uid::text || '/%' then raise exception 'Invalid avatar path'; end if;
  update public.account_members set avatar_path = nullif(v_path, ''), updated_at = now()
  where user_id = v_uid and approved_at is not null;
  if not found then raise exception 'Account is not active'; end if;
  return v_path;
end; $$;
revoke all on function public.set_account_avatar(text) from public, anon;
grant execute on function public.set_account_avatar(text) to authenticated;
