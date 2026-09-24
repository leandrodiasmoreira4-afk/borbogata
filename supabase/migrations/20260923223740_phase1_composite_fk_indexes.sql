-- Cover the tenant-aware composite foreign keys added during Phase 1.
-- Column order mirrors each foreign key so PostgreSQL can use these indexes
-- for joins, referential checks, and parent updates/deletes.
create index if not exists products_category_organization_idx
  on public.products (category_id, organization_id);

create index if not exists variants_product_organization_idx
  on public.product_variants (product_id, organization_id);

create index if not exists images_product_organization_idx
  on public.product_images (product_id, organization_id);

create index if not exists addresses_customer_organization_idx
  on public.addresses (customer_id, organization_id);

create index if not exists orders_customer_organization_idx
  on public.orders (customer_id, organization_id);

create index if not exists order_items_order_organization_idx
  on public.order_items (order_id, organization_id);

create index if not exists order_items_product_organization_idx
  on public.order_items (product_id, organization_id);

create index if not exists order_items_variant_organization_idx
  on public.order_items (variant_id, organization_id);

create index if not exists payments_order_organization_idx
  on public.payments (order_id, organization_id);

create index if not exists shipments_order_organization_idx
  on public.shipments (order_id, organization_id);

create index if not exists inventory_variant_organization_idx
  on public.inventory_movements (variant_id, organization_id);

create index if not exists inventory_order_organization_idx
  on public.inventory_movements (order_id, organization_id);
