create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'admin', 'catalog', 'orders');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.order_status as enum ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled');
create type public.payment_status as enum ('pending', 'authorized', 'paid', 'failed', 'refunded', 'cancelled');
create type public.shipment_status as enum ('pending', 'label_created', 'posted', 'in_transit', 'delivered', 'exception', 'cancelled');
create type public.inventory_reason as enum ('initial', 'sale', 'cancellation', 'return', 'adjustment', 'restock');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  legal_name text,
  document text,
  domain text,
  support_phone text,
  instagram text,
  shipping_origin jsonb not null default '{}'::jsonb,
  brand_config jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'orders',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  slug text not null,
  name text not null,
  description text,
  status public.product_status not null default 'draft',
  featured boolean not null default false,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null,
  name text not null,
  color text,
  size text,
  price_cents bigint not null check (price_cents >= 0),
  compare_at_cents bigint check (compare_at_cents is null or compare_at_cents >= price_cents),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  document text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text,
  recipient_name text not null,
  postal_code text not null,
  street text not null,
  number text not null,
  complement text,
  district text not null,
  city text not null,
  state text not null,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  order_number bigint generated by default as identity,
  status public.order_status not null default 'pending',
  currency char(3) not null default 'BRL',
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  customer_snapshot jsonb not null,
  shipping_address_snapshot jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number),
  check (total_cents = subtotal_cents + shipping_cents - discount_cents)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  created_at timestamptz not null default now(),
  check (total_cents = unit_price_cents * quantity)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null,
  external_id text,
  method text,
  status public.payment_status not null default 'pending',
  amount_cents bigint not null check (amount_cents >= 0),
  paid_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_id)
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null,
  service text,
  external_id text,
  tracking_code text,
  label_url text,
  status public.shipment_status not null default 'pending',
  price_cents bigint check (price_cents is null or price_cents >= 0),
  estimated_delivery_date date,
  posted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  quantity_delta integer not null check (quantity_delta <> 0),
  reason public.inventory_reason not null,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index categories_organization_idx on public.categories(organization_id);
create index products_catalog_idx on public.products(organization_id, status, featured);
create index product_variants_product_idx on public.product_variants(product_id, is_active);
create index product_images_product_idx on public.product_images(product_id, sort_order);
create index customers_organization_idx on public.customers(organization_id, created_at desc);
create index orders_organization_created_idx on public.orders(organization_id, created_at desc);
create index orders_status_idx on public.orders(organization_id, status);
create index inventory_variant_created_idx on public.inventory_movements(variant_id, created_at desc);
create index audit_organization_created_idx on public.audit_logs(organization_id, created_at desc);

create schema if not exists private;

create function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
  );
$$;

create function private.is_org_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$$;

create function private.can_manage_catalog(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin', 'catalog')
  );
$$;

create function private.can_manage_orders(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and role in ('owner', 'admin', 'orders')
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.is_org_admin(uuid) from public;
revoke all on function private.can_manage_catalog(uuid) from public;
revoke all on function private.can_manage_orders(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;
grant execute on function private.can_manage_catalog(uuid) to authenticated;
grant execute on function private.can_manage_orders(uuid) to authenticated;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create trigger organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger product_variants_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger shipments_updated_at before update on public.shipments for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.customers enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_public_read on public.organizations for select to anon, authenticated using (is_active);
create policy organizations_staff_update on public.organizations for update to authenticated using (private.is_org_admin(id)) with check (private.is_org_admin(id));
create policy members_read on public.organization_members for select to authenticated using (user_id = (select auth.uid()) or private.is_org_admin(organization_id));
create policy members_admin_insert on public.organization_members for insert to authenticated with check (private.is_org_admin(organization_id));
create policy members_admin_update on public.organization_members for update to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy members_admin_delete on public.organization_members for delete to authenticated using (private.is_org_admin(organization_id));

create policy categories_public_read on public.categories for select to anon using (is_active);
create policy categories_staff_all on public.categories for all to authenticated using (private.can_manage_catalog(organization_id)) with check (private.can_manage_catalog(organization_id));
create policy products_public_read on public.products for select to anon using (status = 'active');
create policy products_staff_all on public.products for all to authenticated using (private.can_manage_catalog(organization_id)) with check (private.can_manage_catalog(organization_id));
create policy variants_public_read on public.product_variants for select to anon using (is_active and exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));
create policy variants_staff_all on public.product_variants for all to authenticated using (private.can_manage_catalog(organization_id)) with check (private.can_manage_catalog(organization_id));
create policy images_public_read on public.product_images for select to anon using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));
create policy images_staff_all on public.product_images for all to authenticated using (private.can_manage_catalog(organization_id)) with check (private.can_manage_catalog(organization_id));

create policy customers_staff_all on public.customers for all to authenticated using (private.can_manage_orders(organization_id)) with check (private.can_manage_orders(organization_id));
create policy addresses_staff_all on public.addresses for all to authenticated using (private.can_manage_orders(organization_id)) with check (private.can_manage_orders(organization_id));
create policy orders_staff_all on public.orders for all to authenticated using (private.can_manage_orders(organization_id)) with check (private.can_manage_orders(organization_id));
create policy order_items_staff_all on public.order_items for all to authenticated using (private.can_manage_orders(organization_id)) with check (private.can_manage_orders(organization_id));
create policy payments_staff_read on public.payments for select to authenticated using (private.is_org_member(organization_id));
create policy shipments_staff_all on public.shipments for all to authenticated using (private.can_manage_orders(organization_id)) with check (private.can_manage_orders(organization_id));
create policy inventory_staff_all on public.inventory_movements for all to authenticated using (private.can_manage_catalog(organization_id)) with check (private.can_manage_catalog(organization_id));
create policy webhooks_staff_read on public.webhook_events for select to authenticated using (organization_id is not null and private.is_org_admin(organization_id));
create policy audits_staff_read on public.audit_logs for select to authenticated using (private.is_org_admin(organization_id));
create policy audits_staff_insert on public.audit_logs for insert to authenticated with check (private.is_org_member(organization_id) and actor_user_id = (select auth.uid()));

grant usage on schema public to anon, authenticated;
grant select on public.organizations, public.categories, public.products, public.product_variants, public.product_images to anon;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.organizations, public.organization_members, public.categories, public.products, public.product_variants, public.product_images, public.customers, public.addresses, public.orders, public.order_items, public.shipments, public.inventory_movements to authenticated;
grant insert on public.audit_logs to authenticated;

create function public.create_product_with_variant(
  target_organization_id uuid,
  target_category_id uuid,
  product_slug text,
  product_name text,
  product_description text,
  variant_sku text,
  variant_name text,
  variant_color text,
  variant_size text,
  variant_price_cents bigint,
  initial_stock integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_product_id uuid;
  created_variant_id uuid;
begin
  if not private.can_manage_catalog(target_organization_id) then
    raise exception 'not authorized';
  end if;

  if variant_price_cents < 0 or initial_stock < 0 then
    raise exception 'price and stock must be non-negative';
  end if;

  insert into public.products (
    organization_id, category_id, slug, name, description, status
  ) values (
    target_organization_id, target_category_id, product_slug, product_name,
    product_description, 'draft'
  )
  returning id into created_product_id;

  insert into public.product_variants (
    organization_id, product_id, sku, name, color, size, price_cents, stock_quantity
  ) values (
    target_organization_id, created_product_id, variant_sku, variant_name,
    variant_color, variant_size, variant_price_cents, initial_stock
  )
  returning id into created_variant_id;

  if initial_stock > 0 then
    insert into public.inventory_movements (
      organization_id, variant_id, quantity_delta, reason, actor_user_id
    ) values (
      target_organization_id, created_variant_id, initial_stock, 'initial', (select auth.uid())
    );
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    target_organization_id, (select auth.uid()), 'product.created', 'product', created_product_id
  );

  return created_product_id;
end;
$$;

create function public.adjust_inventory(
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

  update public.product_variants
  set stock_quantity = next_stock
  where id = target_variant_id;

  insert into public.inventory_movements (
    organization_id, variant_id, quantity_delta, reason, note, actor_user_id
  ) values (
    target_organization_id, target_variant_id, quantity_change, movement_reason,
    movement_note, (select auth.uid())
  );

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    metadata
  ) values (
    target_organization_id, (select auth.uid()), 'inventory.adjusted',
    'product_variant', target_variant_id,
    jsonb_build_object('previous_stock', current_stock, 'next_stock', next_stock)
  );

  return next_stock;
end;
$$;

revoke all on function public.create_product_with_variant(uuid, uuid, text, text, text, text, text, text, text, bigint, integer) from public;
revoke all on function public.adjust_inventory(uuid, uuid, integer, public.inventory_reason, text) from public;
grant execute on function public.create_product_with_variant(uuid, uuid, text, text, text, text, text, text, text, bigint, integer) to authenticated;
grant execute on function public.adjust_inventory(uuid, uuid, integer, public.inventory_reason, text) to authenticated;
