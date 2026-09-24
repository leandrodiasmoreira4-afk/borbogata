-- Product photography is public for storefront delivery. Mutations remain
-- restricted to catalog staff and paths must begin with the organization id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images', 'product-images', true, 8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_staff_insert on storage.objects;
drop policy if exists product_images_staff_select on storage.objects;
drop policy if exists product_images_staff_update on storage.objects;
drop policy if exists product_images_staff_delete on storage.objects;

create policy product_images_staff_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.organization_members member
    where member.organization_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin', 'catalog')
  )
);

create policy product_images_staff_select
on storage.objects for select to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.organization_members member
    where member.organization_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin', 'catalog')
  )
);

create policy product_images_staff_update
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.organization_members member
    where member.organization_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin', 'catalog')
  )
)
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.organization_members member
    where member.organization_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin', 'catalog')
  )
);

create policy product_images_staff_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.organization_members member
    where member.organization_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin', 'catalog')
  )
);
