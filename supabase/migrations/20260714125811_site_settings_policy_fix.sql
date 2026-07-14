drop policy if exists site_settings_owner_update on public.site_settings;

create policy site_settings_owner_update on public.site_settings
for update to authenticated
using (
  lower(coalesce((select auth.jwt()->>'email'), '')) = 'habkraihistory@gmail.com'
  and exists (
    select 1 from public.editor_members member
    where member.user_id = (select auth.uid())
      and member.role = any (array['editor'::text, 'admin'::text])
      and member.approved_at is not null
  )
)
with check (
  id = 'global'
  and lower(coalesce((select auth.jwt()->>'email'), '')) = 'habkraihistory@gmail.com'
  and exists (
    select 1 from public.editor_members member
    where member.user_id = (select auth.uid())
      and member.role = any (array['editor'::text, 'admin'::text])
      and member.approved_at is not null
  )
);

grant update (maintenance_enabled, updated_at, updated_by) on public.site_settings to authenticated;
