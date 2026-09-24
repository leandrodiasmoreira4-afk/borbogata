-- Phase 1: reconcile the existing schema and harden tenant isolation.
-- This migration is intentionally additive/idempotent so it is safe for
-- databases created from both the older and the current migration baseline.

-- Composite keys allow foreign keys to prove that related records belong to
-- the same organization, instead of trusting application filters alone.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_id_organization_key') then
    alter table public.categories
      add constraint categories_id_organization_key unique (id, organization_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'product_variants_id_organization_key') then
    alter table public.product_variants
      add constraint product_variants_id_organization_key unique (id, organization_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'customers_id_organization_key') then
    alter table public.customers
      add constraint customers_id_organization_key unique (id, organization_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_id_organization_key') then
    alter table public.orders
      add constraint orders_id_organization_key unique (id, organization_id);
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_category_organization_fk') then
    alter table public.products
      add constraint products_category_organization_fk
      foreign key (category_id, organization_id)
      references public.categories (id, organization_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'variants_product_organization_fk') then
    alter table public.product_variants
      add constraint variants_product_organization_fk
      foreign key (product_id, organization_id)
      references public.products (id, organization_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'images_product_organization_fk') then
    alter table public.product_images
      add constraint images_product_organization_fk
      foreign key (product_id, organization_id)
      references public.products (id, organization_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'addresses_customer_organization_fk') then
    alter table public.addresses
      add constraint addresses_customer_organization_fk
      foreign key (customer_id, organization_id)
      references public.customers (id, organization_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_customer_organization_fk') then
    alter table public.orders
      add constraint orders_customer_organization_fk
      foreign key (customer_id, organization_id)
      references public.customers (id, organization_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_order_organization_fk') then
    alter table public.order_items
      add constraint order_items_order_organization_fk
      foreign key (order_id, organization_id)
      references public.orders (id, organization_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_product_organization_fk') then
    alter table public.order_items
      add constraint order_items_product_organization_fk
      foreign key (product_id, organization_id)
      references public.products (id, organization_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_variant_organization_fk') then
    alter table public.order_items
      add constraint order_items_variant_organization_fk
      foreign key (variant_id, organization_id)
      references public.product_variants (id, organization_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payments_order_organization_fk') then
    alter table public.payments
      add constraint payments_order_organization_fk
      foreign key (order_id, organization_id)
      references public.orders (id, organization_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shipments_order_organization_fk') then
    alter table public.shipments
      add constraint shipments_order_organization_fk
      foreign key (order_id, organization_id)
      references public.orders (id, organization_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inventory_variant_organization_fk') then
    alter table public.inventory_movements
      add constraint inventory_variant_organization_fk
      foreign key (variant_id, organization_id)
      references public.product_variants (id, organization_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inventory_order_organization_fk') then
    alter table public.inventory_movements
      add constraint inventory_order_organization_fk
      foreign key (order_id, organization_id)
      references public.orders (id, organization_id);
  end if;
end;
$$;

-- Storefront rows must remain visible after a customer signs in. Supabase uses
-- different database roles for anonymous and authenticated requests.
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read
on public.categories for select to anon, authenticated
using (
  is_active
  and exists (
    select 1 from public.organizations organization
    where organization.id = categories.organization_id
      and organization.is_active
  )
);

drop policy if exists products_public_read on public.products;
create policy products_public_read
on public.products for select to anon, authenticated
using (
  status = 'active'
  and exists (
    select 1 from public.organizations organization
    where organization.id = products.organization_id
      and organization.is_active
  )
);

drop policy if exists variants_public_read on public.product_variants;
create policy variants_public_read
on public.product_variants for select to anon, authenticated
using (
  is_active
  and exists (
    select 1 from public.products product
    join public.organizations organization on organization.id = product.organization_id
    where product.id = product_variants.product_id
      and product.organization_id = product_variants.organization_id
      and product.status = 'active'
      and organization.is_active
  )
);

drop policy if exists images_public_read on public.product_images;
create policy images_public_read
on public.product_images for select to anon, authenticated
using (
  exists (
    select 1 from public.products product
    join public.organizations organization on organization.id = product.organization_id
    where product.id = product_images.product_id
      and product.organization_id = product_images.organization_id
      and product.status = 'active'
      and organization.is_active
  )
);

drop policy if exists collections_public_read on public.collections;
create policy collections_public_read
on public.collections for select to anon, authenticated
using (
  status = 'active'
  and exists (
    select 1 from public.organizations organization
    where organization.id = collections.organization_id
      and organization.is_active
  )
);

drop policy if exists collection_products_public_read on public.collection_products;
create policy collection_products_public_read
on public.collection_products for select to anon, authenticated
using (
  exists (
    select 1 from public.collections collection
    join public.organizations organization on organization.id = collection.organization_id
    where collection.id = collection_products.collection_id
      and collection.organization_id = collection_products.organization_id
      and collection.status = 'active'
      and organization.is_active
  )
  and exists (
    select 1 from public.products product
    where product.id = collection_products.product_id
      and product.organization_id = collection_products.organization_id
      and product.status = 'active'
  )
);

-- A signed-in customer can read only records linked to their own auth user.
-- Creation and financial mutations remain server responsibilities.
drop policy if exists customers_self_read on public.customers;
create policy customers_self_read
on public.customers for select to authenticated
using (auth_user_id = (select auth.uid()));

drop policy if exists addresses_self_read on public.addresses;
create policy addresses_self_read
on public.addresses for select to authenticated
using (
  exists (
    select 1 from public.customers customer
    where customer.id = addresses.customer_id
      and customer.organization_id = addresses.organization_id
      and customer.auth_user_id = (select auth.uid())
  )
);

drop policy if exists orders_self_read on public.orders;
create policy orders_self_read
on public.orders for select to authenticated
using (
  exists (
    select 1 from public.customers customer
    where customer.id = orders.customer_id
      and customer.organization_id = orders.organization_id
      and customer.auth_user_id = (select auth.uid())
  )
);

drop policy if exists order_items_self_read on public.order_items;
create policy order_items_self_read
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.orders customer_order
    join public.customers customer
      on customer.id = customer_order.customer_id
     and customer.organization_id = customer_order.organization_id
    where customer_order.id = order_items.order_id
      and customer_order.organization_id = order_items.organization_id
      and customer.auth_user_id = (select auth.uid())
  )
);

drop policy if exists payments_self_read on public.payments;
create policy payments_self_read
on public.payments for select to authenticated
using (
  exists (
    select 1 from public.orders customer_order
    join public.customers customer
      on customer.id = customer_order.customer_id
     and customer.organization_id = customer_order.organization_id
    where customer_order.id = payments.order_id
      and customer_order.organization_id = payments.organization_id
      and customer.auth_user_id = (select auth.uid())
  )
);

drop policy if exists shipments_self_read on public.shipments;
create policy shipments_self_read
on public.shipments for select to authenticated
using (
  exists (
    select 1 from public.orders customer_order
    join public.customers customer
      on customer.id = customer_order.customer_id
     and customer.organization_id = customer_order.organization_id
    where customer_order.id = shipments.order_id
      and customer_order.organization_id = shipments.organization_id
      and customer.auth_user_id = (select auth.uid())
  )
);

-- Record publication changes even when the admin uses the Data API directly.
create or replace function public.audit_product_status_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, metadata
    ) values (
      new.organization_id,
      (select auth.uid()),
      'product.status_changed',
      'product',
      new.id,
      jsonb_build_object('previous_status', old.status, 'next_status', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists products_audit_status_change on public.products;
create trigger products_audit_status_change
after update of status on public.products
for each row execute function public.audit_product_status_change();

revoke all on function public.audit_product_status_change() from public, anon, authenticated;

-- Stock may only change through an audited database operation. This prevents
-- a catalog client from bypassing inventory_movements with a direct UPDATE.
create or replace function private.guard_variant_stock_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.stock_quantity is distinct from new.stock_quantity
    and coalesce(current_setting('l7.inventory_write', true), '') <> 'allowed'
  then
    raise exception 'stock must be changed through adjust_inventory';
  end if;
  return new;
end;
$$;

drop trigger if exists variants_guard_stock_update on public.product_variants;
create trigger variants_guard_stock_update
before update of stock_quantity on public.product_variants
for each row execute function private.guard_variant_stock_update();

revoke all on function private.guard_variant_stock_update() from public, anon, authenticated;

create or replace function public.adjust_inventory(
  target_organization_id uuid,
  target_variant_id uuid,
  quantity_change integer,
  movement_reason public.inventory_reason,
  movement_note text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_stock integer;
  next_stock integer;
begin
  if not private.can_manage_catalog(target_organization_id) then
    raise exception 'not authorized';
  end if;

  if quantity_change = 0 then
    raise exception 'quantity change cannot be zero';
  end if;

  select stock_quantity into current_stock
  from public.product_variants
  where id = target_variant_id
    and organization_id = target_organization_id
  for update;

  if current_stock is null then
    raise exception 'variant not found';
  end if;

  next_stock := current_stock + quantity_change;
  if next_stock < 0 then
    raise exception 'insufficient stock';
  end if;

  perform set_config('l7.inventory_write', 'allowed', true);

  update public.product_variants
  set stock_quantity = next_stock
  where id = target_variant_id
    and organization_id = target_organization_id;

  insert into public.inventory_movements (
    organization_id, variant_id, quantity_delta, reason, note, actor_user_id
  ) values (
    target_organization_id, target_variant_id, quantity_change, movement_reason,
    movement_note, (select auth.uid())
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_organization_id, (select auth.uid()), 'inventory.adjusted',
    'product_variant', target_variant_id,
    jsonb_build_object(
      'previous_stock', current_stock,
      'next_stock', next_stock,
      'reason', movement_reason,
      'note', movement_note
    )
  );

  return next_stock;
end;
$$;

-- Function execution is denied by default; each application RPC must be
-- explicitly granted in its own migration.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

revoke execute on function public.create_product_with_variant(
  uuid, uuid, text, text, text, text, text, text, text, bigint, integer
) from anon;
revoke execute on function public.adjust_inventory(
  uuid, uuid, integer, public.inventory_reason, text
) from anon;
grant execute on function public.adjust_inventory(
  uuid, uuid, integer, public.inventory_reason, text
) to authenticated;

-- Explicit grants keep Data API behavior consistent for new Supabase projects.
grant select on public.organizations, public.categories, public.products,
  public.product_variants, public.product_images, public.collections,
  public.collection_products to anon;
grant select on public.organizations, public.categories, public.products,
  public.product_variants, public.product_images, public.collections,
  public.collection_products, public.customers, public.addresses, public.orders,
  public.order_items, public.payments, public.shipments to authenticated;
