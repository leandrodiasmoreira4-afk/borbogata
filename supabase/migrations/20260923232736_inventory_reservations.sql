-- Phase 3: transactional inventory reservations.
-- Physical stock remains in stock_quantity. Active reservations are tracked in
-- reserved_quantity so the storefront can expose only inventory that is
-- actually available for a new checkout.

create type public.inventory_reservation_status as enum (
  'active',
  'confirmed',
  'released',
  'expired'
);

alter table public.product_variants
  add column reserved_quantity integer not null default 0;

alter table public.product_variants
  add constraint product_variants_reserved_quantity_check
  check (reserved_quantity >= 0 and reserved_quantity <= stock_quantity);

create table public.inventory_reservation_groups (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid,
  status public.inventory_reservation_status not null default 'active',
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_expiry_after_creation check (expires_at > created_at),
  constraint reservation_order_organization_fk
    foreign key (order_id, organization_id)
    references public.orders(id, organization_id),
  constraint reservation_lifecycle_check check (
    (status = 'active' and confirmed_at is null and released_at is null)
    or (status = 'confirmed' and confirmed_at is not null and released_at is null and order_id is not null)
    or (status in ('released', 'expired') and confirmed_at is null and released_at is not null)
  )
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reservation_group_id uuid not null references public.inventory_reservation_groups(id) on delete restrict,
  variant_id uuid not null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  constraint reservation_item_variant_organization_fk
    foreign key (variant_id, organization_id)
    references public.product_variants(id, organization_id),
  unique (reservation_group_id, variant_id)
);

create index inventory_reservation_groups_expiry_idx
  on public.inventory_reservation_groups(expires_at, id)
  where status = 'active';
create index inventory_reservation_groups_organization_idx
  on public.inventory_reservation_groups(organization_id, created_at desc);
create index inventory_reservation_groups_order_idx
  on public.inventory_reservation_groups(order_id, organization_id)
  where order_id is not null;
create index inventory_reservations_variant_idx
  on public.inventory_reservations(variant_id, organization_id);
create index inventory_reservations_organization_idx
  on public.inventory_reservations(organization_id, created_at desc);

create trigger inventory_reservation_groups_set_updated_at
before update on public.inventory_reservation_groups
for each row execute function public.set_updated_at();

alter table public.inventory_reservation_groups enable row level security;
alter table public.inventory_reservations enable row level security;

create policy reservation_groups_team_read
on public.inventory_reservation_groups for select to authenticated
using (private.is_org_member(organization_id));

create policy reservations_team_read
on public.inventory_reservations for select to authenticated
using (private.is_org_member(organization_id));

grant select on public.inventory_reservation_groups, public.inventory_reservations to authenticated;

-- Stock and reservation counters may only change inside the audited inventory
-- functions below. This replaces the Phase 1 trigger with the stricter rule.
create or replace function private.guard_variant_stock_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    old.stock_quantity is distinct from new.stock_quantity
    or old.reserved_quantity is distinct from new.reserved_quantity
  ) and coalesce(current_setting('l7.inventory_write', true), '') <> 'allowed'
  then
    raise exception 'inventory must be changed through an inventory operation';
  end if;
  return new;
end;
$$;

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
  current_reserved integer;
  next_stock integer;
begin
  if not private.can_manage_catalog(target_organization_id) then
    raise exception 'not authorized';
  end if;

  if quantity_change = 0 then
    raise exception 'quantity change cannot be zero';
  end if;

  select stock_quantity, reserved_quantity
  into current_stock, current_reserved
  from public.product_variants
  where id = target_variant_id
    and organization_id = target_organization_id
  for update;

  if current_stock is null then
    raise exception 'variant not found';
  end if;

  next_stock := current_stock + quantity_change;
  if next_stock < current_reserved then
    raise exception 'inventory adjustment would consume reserved stock';
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
      'reserved_stock', current_reserved,
      'reason', movement_reason,
      'note', movement_note
    )
  );

  return next_stock;
end;
$$;

create function private.release_inventory_reservation_group(
  target_organization_id uuid,
  target_reservation_id uuid,
  target_status public.inventory_reservation_status
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status public.inventory_reservation_status;
begin
  if target_status not in ('released', 'expired') then
    raise exception 'invalid release status';
  end if;

  select status into current_status
  from public.inventory_reservation_groups
  where id = target_reservation_id
    and organization_id = target_organization_id
  for update;

  if current_status is null then
    raise exception 'reservation not found';
  end if;

  if current_status = target_status then
    return false;
  end if;

  if current_status <> 'active' then
    raise exception 'reservation is not active';
  end if;

  perform 1
  from public.product_variants variant
  join public.inventory_reservations reservation
    on reservation.variant_id = variant.id
   and reservation.organization_id = variant.organization_id
  where reservation.reservation_group_id = target_reservation_id
    and reservation.organization_id = target_organization_id
  order by variant.id
  for update of variant;

  perform set_config('l7.inventory_write', 'allowed', true);

  update public.product_variants variant
  set reserved_quantity = variant.reserved_quantity - released.quantity
  from (
    select variant_id, organization_id, sum(quantity)::integer as quantity
    from public.inventory_reservations
    where reservation_group_id = target_reservation_id
      and organization_id = target_organization_id
    group by variant_id, organization_id
  ) released
  where variant.id = released.variant_id
    and variant.organization_id = released.organization_id;

  update public.inventory_reservation_groups
  set status = target_status,
      released_at = clock_timestamp()
  where id = target_reservation_id
    and organization_id = target_organization_id;

  insert into public.audit_logs (
    organization_id, action, entity_type, entity_id, metadata
  ) values (
    target_organization_id,
    case when target_status = 'expired' then 'inventory.reservation_expired' else 'inventory.reservation_released' end,
    'inventory_reservation',
    target_reservation_id,
    jsonb_build_object('status', target_status)
  );

  return true;
end;
$$;

create function private.expire_inventory_reservations(batch_size integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  expired_count integer := 0;
begin
  if batch_size < 1 or batch_size > 1000 then
    raise exception 'batch size must be between 1 and 1000';
  end if;

  for candidate in
    select id, organization_id
    from public.inventory_reservation_groups
    where status = 'active'
      and expires_at <= clock_timestamp()
    order by expires_at, id
    limit batch_size
    for update skip locked
  loop
    if private.release_inventory_reservation_group(
      candidate.organization_id,
      candidate.id,
      'expired'
    ) then
      expired_count := expired_count + 1;
    end if;
  end loop;

  return expired_count;
end;
$$;

create function public.reserve_inventory(
  target_organization_id uuid,
  reservation_id uuid,
  requested_items jsonb,
  ttl_seconds integer default 900
)
returns table (
  reservation_group_id uuid,
  variant_id uuid,
  quantity integer,
  expires_at timestamptz,
  available_after integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_group public.inventory_reservation_groups%rowtype;
  requested_count integer;
  matched_count integer;
  reservation_expiry timestamptz;
begin
  if target_organization_id is null or reservation_id is null then
    raise exception 'organization and reservation id are required';
  end if;

  if requested_items is null
    or jsonb_typeof(requested_items) <> 'array'
    or jsonb_array_length(requested_items) < 1
    or jsonb_array_length(requested_items) > 50
  then
    raise exception 'requested items must contain between 1 and 50 entries';
  end if;

  if ttl_seconds is null or ttl_seconds < 300 or ttl_seconds > 1800 then
    raise exception 'reservation ttl must be between 300 and 1800 seconds';
  end if;

  with requested as (
    select (item->>'variant_id')::uuid as variant_id,
           (item->>'quantity')::integer as quantity
    from jsonb_array_elements(requested_items) item
  )
  select count(*), count(distinct variant_id)
  into requested_count, matched_count
  from requested
  where quantity > 0;

  if requested_count <> jsonb_array_length(requested_items)
    or requested_count <> matched_count
  then
    raise exception 'items must have unique variants and positive integer quantities';
  end if;

  insert into public.inventory_reservation_groups (
    id, organization_id, expires_at
  ) values (
    reservation_id,
    target_organization_id,
    clock_timestamp() + make_interval(secs => ttl_seconds)
  )
  on conflict (id) do nothing;

  select * into existing_group
  from public.inventory_reservation_groups
  where id = reservation_id
  for update;

  if existing_group.organization_id <> target_organization_id then
    raise exception 'reservation id already belongs to another organization';
  end if;

  if exists (
    select 1 from public.inventory_reservations
    where reservation_group_id = reservation_id
  ) then
    if existing_group.status <> 'active' or existing_group.expires_at <= clock_timestamp() then
      raise exception 'reservation is no longer active';
    end if;

    with requested as (
      select (item->>'variant_id')::uuid as variant_id,
             (item->>'quantity')::integer as quantity
      from jsonb_array_elements(requested_items) item
    )
    select count(*) into matched_count
    from requested
    join public.inventory_reservations stored
      on stored.variant_id = requested.variant_id
     and stored.quantity = requested.quantity
    where stored.reservation_group_id = reservation_id
      and stored.organization_id = target_organization_id;

    if matched_count <> requested_count or (
      select count(*) from public.inventory_reservations
      where reservation_group_id = reservation_id
        and organization_id = target_organization_id
    ) <> requested_count then
      raise exception 'reservation id was reused with different items';
    end if;

    return query
    select stored.reservation_group_id,
           stored.variant_id,
           stored.quantity,
           existing_group.expires_at,
           variant.stock_quantity - variant.reserved_quantity
    from public.inventory_reservations stored
    join public.product_variants variant
      on variant.id = stored.variant_id
     and variant.organization_id = stored.organization_id
    where stored.reservation_group_id = reservation_id
      and stored.organization_id = target_organization_id
    order by stored.variant_id;
    return;
  end if;

  perform 1
  from public.product_variants variant
  join (
    select (item->>'variant_id')::uuid as variant_id,
           (item->>'quantity')::integer as quantity
    from jsonb_array_elements(requested_items) item
  ) requested on requested.variant_id = variant.id
  join public.products product
    on product.id = variant.product_id
   and product.organization_id = variant.organization_id
  where variant.organization_id = target_organization_id
    and variant.is_active
    and product.status = 'active'
  order by variant.id
  for update of variant;

  with requested as (
    select (item->>'variant_id')::uuid as variant_id,
           (item->>'quantity')::integer as quantity
    from jsonb_array_elements(requested_items) item
  )
  select count(*) into matched_count
  from requested
  join public.product_variants variant
    on variant.id = requested.variant_id
   and variant.organization_id = target_organization_id
   and variant.is_active
  join public.products product
    on product.id = variant.product_id
   and product.organization_id = variant.organization_id
   and product.status = 'active'
  where variant.stock_quantity - variant.reserved_quantity >= requested.quantity;

  if matched_count <> requested_count then
    raise exception 'one or more items are unavailable in the requested quantity';
  end if;

  insert into public.inventory_reservations (
    organization_id, reservation_group_id, variant_id, quantity
  )
  select target_organization_id,
         reservation_id,
         (item->>'variant_id')::uuid,
         (item->>'quantity')::integer
  from jsonb_array_elements(requested_items) item;

  perform set_config('l7.inventory_write', 'allowed', true);

  update public.product_variants variant
  set reserved_quantity = variant.reserved_quantity + requested.quantity
  from (
    select (item->>'variant_id')::uuid as variant_id,
           (item->>'quantity')::integer as quantity
    from jsonb_array_elements(requested_items) item
  ) requested
  where variant.id = requested.variant_id
    and variant.organization_id = target_organization_id;

  select expires_at into reservation_expiry
  from public.inventory_reservation_groups
  where id = reservation_id;

  insert into public.audit_logs (
    organization_id, action, entity_type, entity_id, metadata
  ) values (
    target_organization_id,
    'inventory.reserved',
    'inventory_reservation',
    reservation_id,
    jsonb_build_object('expires_at', reservation_expiry, 'items', requested_items)
  );

  return query
  select stored.reservation_group_id,
         stored.variant_id,
         stored.quantity,
         reservation_expiry,
         variant.stock_quantity - variant.reserved_quantity
  from public.inventory_reservations stored
  join public.product_variants variant
    on variant.id = stored.variant_id
   and variant.organization_id = stored.organization_id
  where stored.reservation_group_id = reservation_id
    and stored.organization_id = target_organization_id
  order by stored.variant_id;
end;
$$;

create function public.confirm_inventory_reservation(
  target_organization_id uuid,
  target_reservation_id uuid,
  target_order_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reservation_group public.inventory_reservation_groups%rowtype;
begin
  select * into reservation_group
  from public.inventory_reservation_groups
  where id = target_reservation_id
    and organization_id = target_organization_id
  for update;

  if reservation_group.id is null then
    raise exception 'reservation not found';
  end if;

  if reservation_group.status = 'confirmed' then
    if reservation_group.order_id = target_order_id then
      return false;
    end if;
    raise exception 'reservation was already confirmed for another order';
  end if;

  if reservation_group.status <> 'active' then
    raise exception 'reservation is not active';
  end if;

  if reservation_group.expires_at <= clock_timestamp() then
    perform private.release_inventory_reservation_group(
      target_organization_id,
      target_reservation_id,
      'expired'
    );
    return false;
  end if;

  if not exists (
    select 1 from public.orders
    where id = target_order_id
      and organization_id = target_organization_id
  ) then
    raise exception 'order not found';
  end if;

  perform 1
  from public.product_variants variant
  join public.inventory_reservations reservation
    on reservation.variant_id = variant.id
   and reservation.organization_id = variant.organization_id
  where reservation.reservation_group_id = target_reservation_id
    and reservation.organization_id = target_organization_id
  order by variant.id
  for update of variant;

  if exists (
    select 1
    from public.inventory_reservations reservation
    join public.product_variants variant
      on variant.id = reservation.variant_id
     and variant.organization_id = reservation.organization_id
    where reservation.reservation_group_id = target_reservation_id
      and reservation.organization_id = target_organization_id
      and (
        variant.reserved_quantity < reservation.quantity
        or variant.stock_quantity < reservation.quantity
      )
  ) then
    raise exception 'reserved inventory is inconsistent';
  end if;

  perform set_config('l7.inventory_write', 'allowed', true);

  update public.product_variants variant
  set stock_quantity = variant.stock_quantity - confirmed.quantity,
      reserved_quantity = variant.reserved_quantity - confirmed.quantity
  from (
    select variant_id, organization_id, sum(quantity)::integer as quantity
    from public.inventory_reservations
    where reservation_group_id = target_reservation_id
      and organization_id = target_organization_id
    group by variant_id, organization_id
  ) confirmed
  where variant.id = confirmed.variant_id
    and variant.organization_id = confirmed.organization_id;

  insert into public.inventory_movements (
    organization_id, variant_id, order_id, quantity_delta, reason, note
  )
  select organization_id,
         variant_id,
         target_order_id,
         -quantity,
         'sale',
         'Confirmed inventory reservation ' || target_reservation_id::text
  from public.inventory_reservations
  where reservation_group_id = target_reservation_id
    and organization_id = target_organization_id;

  update public.inventory_reservation_groups
  set status = 'confirmed',
      order_id = target_order_id,
      confirmed_at = clock_timestamp()
  where id = target_reservation_id
    and organization_id = target_organization_id;

  insert into public.audit_logs (
    organization_id, action, entity_type, entity_id, metadata
  ) values (
    target_organization_id,
    'inventory.reservation_confirmed',
    'inventory_reservation',
    target_reservation_id,
    jsonb_build_object('order_id', target_order_id)
  );

  return true;
end;
$$;

create function public.release_inventory_reservation(
  target_organization_id uuid,
  target_reservation_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.release_inventory_reservation_group(
    target_organization_id,
    target_reservation_id,
    'released'
  );
$$;

revoke all on function private.guard_variant_stock_update() from public, anon, authenticated;
revoke all on function private.release_inventory_reservation_group(uuid, uuid, public.inventory_reservation_status) from public, anon, authenticated;
revoke all on function private.expire_inventory_reservations(integer) from public, anon, authenticated;
revoke all on function public.reserve_inventory(uuid, uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.confirm_inventory_reservation(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_inventory_reservation(uuid, uuid) from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.release_inventory_reservation_group(uuid, uuid, public.inventory_reservation_status) to service_role;
grant execute on function public.reserve_inventory(uuid, uuid, jsonb, integer) to service_role;
grant execute on function public.confirm_inventory_reservation(uuid, uuid, uuid) to service_role;
grant execute on function public.release_inventory_reservation(uuid, uuid) to service_role;

-- Expiration also runs lazily from checkout operations, and this scheduled job
-- guarantees abandoned reservations are released even when no new checkout is
-- started. Supabase Cron is backed by pg_cron.
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'l7-expire-inventory-reservations';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'l7-expire-inventory-reservations',
    '* * * * *',
    'select private.expire_inventory_reservations(100);'
  );
end;
$$;
