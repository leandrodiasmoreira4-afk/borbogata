-- PostgreSQL exposes RETURNS TABLE columns as PL/pgSQL variables. Prefer SQL
-- columns when a returned name (variant_id, quantity, expires_at) is also used
-- by a query inside the reservation function.
create or replace function public.reserve_inventory(
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
#variable_conflict use_column
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
  select count(*), count(distinct requested.variant_id)
  into requested_count, matched_count
  from requested
  where requested.quantity > 0;

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

  select reservation_group.* into existing_group
  from public.inventory_reservation_groups reservation_group
  where reservation_group.id = reservation_id
  for update;

  if existing_group.organization_id <> target_organization_id then
    raise exception 'reservation id already belongs to another organization';
  end if;

  if exists (
    select 1
    from public.inventory_reservations stored
    where stored.reservation_group_id = reservation_id
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
      select count(*)
      from public.inventory_reservations stored
      where stored.reservation_group_id = reservation_id
        and stored.organization_id = target_organization_id
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

  select reservation_group.expires_at into reservation_expiry
  from public.inventory_reservation_groups reservation_group
  where reservation_group.id = reservation_id;

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

revoke all on function public.reserve_inventory(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.reserve_inventory(uuid, uuid, jsonb, integer) to service_role;
