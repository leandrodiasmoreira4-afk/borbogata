drop policy members_read_own on public.organization_members;
drop policy members_admin_all on public.organization_members;
create policy members_read on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_org_admin(organization_id));
create policy members_admin_insert on public.organization_members for insert to authenticated
  with check (private.is_org_admin(organization_id));
create policy members_admin_update on public.organization_members for update to authenticated
  using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy members_admin_delete on public.organization_members for delete to authenticated
  using (private.is_org_admin(organization_id));

alter policy categories_public_read on public.categories to anon;
alter policy products_public_read on public.products to anon;
alter policy variants_public_read on public.product_variants to anon;
alter policy images_public_read on public.product_images to anon;
