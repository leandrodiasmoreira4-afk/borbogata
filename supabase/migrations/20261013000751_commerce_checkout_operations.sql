-- Pending staging validation. Do not push against the remote migration history
-- until its existing version identifiers have been reconciled.
alter table public.product_variants add column promotion_starts_at timestamptz;
alter table public.product_variants add column promotion_ends_at timestamptz;
alter table public.product_variants add constraint promotion_window_valid check (
  (promotion_starts_at is null and promotion_ends_at is null) or
  (compare_at_cents > price_cents and promotion_starts_at is not null
   and promotion_ends_at is not null and promotion_ends_at > promotion_starts_at)
);

create function public.schedule_variant_promotion(
  target_organization_id uuid, target_variant_id uuid,
  starts_at timestamptz, ends_at timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.can_manage_catalog(target_organization_id) then raise exception 'not authorized'; end if;
  update public.product_variants set promotion_starts_at = starts_at, promotion_ends_at = ends_at
  where id = target_variant_id and organization_id = target_organization_id;
  if not found then raise exception 'variant not found'; end if;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(target_organization_id,auth.uid(),'promotion.scheduled','product_variant',target_variant_id,
    jsonb_build_object('starts_at',starts_at,'ends_at',ends_at));
end;
$$;
revoke all on function public.schedule_variant_promotion(uuid,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.schedule_variant_promotion(uuid,uuid,timestamptz,timestamptz) to authenticated;

-- Operational configuration is private to the team, separate from the public organization row.
create table public.commerce_settings (
  organization_id uuid primary key references public.organizations(id),
  pickup_enabled boolean not null default false,
  pickup_instructions text not null default '',
  courier_enabled boolean not null default false,
  courier_fee_cents integer check(courier_fee_cents >= 0),
  courier_postal_prefixes text[] not null default '{}',
  correios_enabled boolean not null default false,
  origin_postal_code text check(origin_postal_code ~ '^\d{8}$'),
  updated_at timestamptz not null default now(),
  check(not pickup_enabled or length(trim(pickup_instructions)) > 0),
  check(not courier_enabled or (courier_fee_cents is not null and cardinality(courier_postal_prefixes) > 0))
);
alter table public.commerce_settings enable row level security;
create policy settings_read on public.commerce_settings for select to authenticated using(private.is_org_admin(organization_id));
create policy settings_write on public.commerce_settings for all to authenticated using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
grant select,insert,update on public.commerce_settings to authenticated;
grant all on public.commerce_settings to service_role;

create table public.coupons (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  code text not null check(code ~ '^[A-Z0-9_-]{3,40}$'),
  kind text not null check(kind in ('fixed','percent')),
  value integer not null check(value > 0), minimum_cents bigint not null default 0 check(minimum_cents >= 0),
  starts_at timestamptz not null, ends_at timestamptz not null,
  is_active boolean not null default false,
  allow_promotions boolean not null default false,
  unique(organization_id,code), check(ends_at > starts_at), check(kind <> 'percent' or value <= 100)
);
alter table public.coupons enable row level security;
create policy coupons_admin on public.coupons for all to authenticated using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
grant select,insert,update,delete on public.coupons to authenticated;
grant all on public.coupons to service_role;

alter table public.orders add column payment_environment text check(payment_environment in ('sandbox','production'));
alter table public.orders add column payment_review_required boolean not null default false;
alter table public.orders add column reservation_id uuid references public.inventory_reservation_groups(id);
create index orders_reservation_idx on public.orders(reservation_id);
alter table public.payments add column provider_updated_at timestamptz;
alter table public.payments add column refunded_cents bigint not null default 0 check(refunded_cents >= 0 and refunded_cents <= amount_cents);

-- Serialize on the order. Event insert, payment upsert and inventory confirmation
-- share one transaction: retries cannot partially commit or decrement stock twice.
create function public.process_verified_sandbox_payment(verified_payment jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  target_order public.orders%rowtype;
  existing_payment public.payments%rowtype;
  event_key text;
  event_id uuid;
  payment_id text := verified_payment->>'id';
  provider_status text := verified_payment->>'status';
  changed_at timestamptz := (verified_payment->>'updatedAt')::timestamptz;
  amount bigint := (verified_payment->>'amountCents')::bigint;
  refunded bigint := (verified_payment->>'refundedCents')::bigint;
  mapped_status public.payment_status;
  stock_confirmed boolean := false;
begin
  if verified_payment->>'liveMode' is distinct from 'false' or payment_id !~ '^\d{1,30}$'
     or changed_at is null or amount is null or refunded is null or amount < 1 or refunded < 0 or refunded > amount then
    raise exception 'invalid verified payment';
  end if;
  select * into target_order from public.orders where id = (verified_payment->>'orderId')::uuid for update;
  if not found or target_order.payment_environment is distinct from 'sandbox' or target_order.total_cents <> amount then
    raise exception 'payment does not match order';
  end if;
  select * into existing_payment from public.payments where organization_id = target_order.organization_id
    and provider = 'mercado_pago' and external_id = payment_id;
  if existing_payment.id is not null and existing_payment.order_id <> target_order.id then raise exception 'payment belongs to another order'; end if;
  if existing_payment.provider_updated_at >= changed_at then return 'duplicate_or_stale'; end if;
  event_key := 'sandbox:' || payment_id || ':' || changed_at::text;
  insert into public.webhook_events(organization_id,provider,external_event_id,event_type,payload)
  values(target_order.organization_id,'mercado_pago',event_key,'payment',verified_payment)
  on conflict(provider,external_event_id) do nothing returning id into event_id;
  if event_id is null then return 'duplicate'; end if;
  mapped_status := case provider_status when 'approved' then 'paid' when 'authorized' then 'authorized'
    when 'rejected' then 'failed' when 'cancelled' then 'cancelled' when 'refunded' then 'refunded'
    when 'charged_back' then 'refunded' when 'pending' then 'pending' when 'in_process' then 'pending'
    when 'in_mediation' then 'pending' else null end;
  if mapped_status is null then raise exception 'unsupported status'; end if;
  insert into public.payments(organization_id,order_id,provider,external_id,status,amount_cents,refunded_cents,provider_updated_at,paid_at)
  values(target_order.organization_id,target_order.id,'mercado_pago',payment_id,mapped_status,amount,refunded,changed_at,
    case when mapped_status = 'paid' then changed_at end)
  on conflict(organization_id,provider,external_id) do update set status = excluded.status,
    refunded_cents = excluded.refunded_cents, provider_updated_at = excluded.provider_updated_at,
    paid_at = coalesce(public.payments.paid_at,excluded.paid_at);
  if mapped_status = 'paid' and refunded = 0 and target_order.status = 'pending' and not target_order.payment_review_required then
    if exists(select 1 from public.inventory_reservation_groups where id=target_order.reservation_id
      and organization_id=target_order.organization_id and status='active' and expires_at>clock_timestamp()) then
      select public.confirm_inventory_reservation(target_order.organization_id,target_order.reservation_id,target_order.id) into stock_confirmed;
    end if;
    update public.orders set status = case when stock_confirmed then 'confirmed'::public.order_status else status end,
      payment_review_required = not stock_confirmed where id = target_order.id;
  end if;
  if refunded > 0 or provider_status in ('refunded','charged_back','in_mediation')
     or target_order.status = 'cancelled'
     or exists(select 1 from public.payments where order_id = target_order.id and status = 'paid' and external_id <> payment_id) then
    update public.orders set payment_review_required = true where id = target_order.id;
  end if;
  update public.webhook_events set processed_at = clock_timestamp() where id = event_id;
  return 'processed';
end;
$$;
revoke all on function public.process_verified_sandbox_payment(jsonb) from public,anon,authenticated;
grant execute on function public.process_verified_sandbox_payment(jsonb) to service_role;

-- The existing panel uses direct updates. Enforce fulfillment rules in Postgres,
-- not only in the button's disabled state.
create function private.guard_order_fulfillment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' and (
    new.total_cents <> old.total_cents or new.subtotal_cents <> old.subtotal_cents or
    new.shipping_cents <> old.shipping_cents or new.discount_cents <> old.discount_cents or
    new.organization_id <> old.organization_id or new.currency <> old.currency or new.payment_environment is distinct from old.payment_environment or
    new.reservation_id is distinct from old.reservation_id or new.payment_review_required <> old.payment_review_required
  ) then raise exception 'financial fields are server controlled'; end if;
  if new.status is distinct from old.status and current_user = 'authenticated' then
    if not ((old.status = 'confirmed' and new.status = 'processing') or
      (old.status = 'processing' and new.status = 'shipped') or (old.status = 'shipped' and new.status = 'delivered')) then
      raise exception 'invalid fulfillment transition';
    end if;
    if new.payment_review_required or not exists(select 1 from public.payments where order_id = new.id
      and organization_id = new.organization_id and status = 'paid' and refunded_cents = 0 and amount_cents = new.total_cents) then
      raise exception 'verified payment required';
    end if;
    if new.status = 'shipped' and exists(select 1 from public.shipments where order_id = new.id and provider = 'correios'
      and nullif(trim(tracking_code),'') is null) then raise exception 'tracking required'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_order_fulfillment() from public,anon,authenticated;
create trigger orders_guard_fulfillment before update on public.orders for each row execute function private.guard_order_fulfillment();
revoke insert,delete on public.orders,public.order_items from authenticated;
revoke update on public.order_items from authenticated;
revoke insert,delete on public.shipments from authenticated;

create function private.guard_shipment_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user='authenticated' then
    if new.order_id<>old.order_id or new.organization_id<>old.organization_id or new.provider<>old.provider
      or new.price_cents is distinct from old.price_cents then raise exception 'shipment identity is server controlled'; end if;
    if not exists(select 1 from public.orders o join public.payments p on p.order_id=o.id
      where o.id=new.order_id and o.organization_id=new.organization_id and not o.payment_review_required
      and p.status='paid' and p.refunded_cents=0 and p.amount_cents=o.total_cents) then raise exception 'verified payment required'; end if;
    if new.tracking_code is not null and new.tracking_code !~ '^[A-Z0-9]{8,35}$' then raise exception 'invalid tracking'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_shipment_update() from public,anon,authenticated;
create trigger shipments_guard_update before update on public.shipments for each row execute function private.guard_shipment_update();

create function public.commerce_report(target_organization_id uuid, since_date timestamptz, until_date timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not private.can_manage_orders(target_organization_id) then raise exception 'not authorized'; end if;
  if since_date is null or until_date is null or until_date <= since_date or until_date - since_date > interval '366 days' then raise exception 'invalid period'; end if;
  select jsonb_build_object('orders',count(*),'gross_cents',coalesce(sum(total_cents),0),
    'paid_cents',coalesce(sum((select coalesce(sum(p.amount_cents-p.refunded_cents),0) from public.payments p
      where p.order_id=o.id and p.status='paid')),0),'review_required',count(*) filter(where payment_review_required)) into result
  from public.orders o where organization_id=target_organization_id and created_at>=since_date and created_at<until_date;
  return result;
end;
$$;
revoke all on function public.commerce_report(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.commerce_report(uuid,timestamptz,timestamptz) to authenticated;

create table public.checkout_sessions (
  id uuid primary key references public.orders(id),
  fingerprint text not null,
  payment_url text,
  preference_id text,
  created_at timestamptz not null default now()
);
alter table public.checkout_sessions enable row level security;
grant all on public.checkout_sessions to service_role;

create function public.create_sandbox_order(store_slug text, checkout_id uuid, request_fingerprint text,
  requested_items jsonb, checkout_details jsonb, coupon_code text default '')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  org uuid;
  settings public.commerce_settings%rowtype;
  coupon public.coupons%rowtype;
  session_row public.checkout_sessions%rowtype;
  existing_order public.orders%rowtype;
  customer uuid;
  subtotal bigint;
  shipping bigint;
  discount bigint := 0;
  requested_count integer;
  delivery text := checkout_details->>'delivery';
  postal text := replace(checkout_details->>'postalCode','-','');
begin
  if checkout_id is null or request_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid checkout'; end if;
  perform pg_advisory_xact_lock(hashtextextended(checkout_id::text,0));
  select * into session_row from public.checkout_sessions where id=checkout_id;
  if found then
    if session_row.fingerprint <> request_fingerprint then raise exception 'checkout key reused'; end if;
    select * into existing_order from public.orders where id=checkout_id;
    if existing_order.status <> 'pending' or not exists(select 1 from public.inventory_reservation_groups where id=checkout_id and status='active' and expires_at>clock_timestamp()) then
      raise exception 'checkout expired or completed';
    end if;
    return jsonb_build_object('reused',true,'paymentUrl',session_row.payment_url,'orderId',checkout_id,
      'subtotalCents',existing_order.subtotal_cents,'shippingCents',existing_order.shipping_cents,'discountCents',existing_order.discount_cents);
  end if;
  select id into org from public.organizations where slug=store_slug and is_active;
  if org is null then raise exception 'store unavailable'; end if;
  select * into settings from public.commerce_settings where organization_id=org;
  if delivery='pickup' and settings.pickup_enabled then shipping:=0;
  elsif delivery='courier' and settings.courier_enabled and lower(trim(checkout_details->>'city'))='salvador'
    and upper(checkout_details->>'state')='BA' and postal ~ '^\d{8}$'
    and exists(select 1 from unnest(settings.courier_postal_prefixes) prefix where prefix ~ '^\d{5,8}$' and starts_with(postal,prefix)) then
    shipping:=settings.courier_fee_cents;
  else raise exception 'delivery unavailable or freight not configured'; end if;
  if jsonb_typeof(requested_items)<>'array' or jsonb_array_length(requested_items) not between 1 and 30 then raise exception 'invalid cart'; end if;
  if exists(select 1 from jsonb_array_elements(requested_items) item where (item->>'quantity')::numeric not between 1 and 99 or
    (item->>'quantity')::numeric <> trunc((item->>'quantity')::numeric)) then raise exception 'invalid quantity'; end if;
  perform public.reserve_inventory(org,checkout_id,requested_items,900);
  -- reserve_inventory locks variants. Price and stock now share the same snapshot.
  select count(*),sum((item->>'quantity')::integer * (case when v.promotion_starts_at is not null and
    not(now() >= v.promotion_starts_at and now() < v.promotion_ends_at) then v.compare_at_cents else v.price_cents end))
    into requested_count,subtotal
  from jsonb_array_elements(requested_items) item join public.product_variants v on v.id=(item->>'variant_id')::uuid
  where v.organization_id=org and v.is_active and v.price_cents>0;
  if requested_count<>jsonb_array_length(requested_items) or subtotal is null or subtotal<1 then raise exception 'invalid catalog price'; end if;
  if coalesce(coupon_code,'')<>'' then
    select * into coupon from public.coupons where organization_id=org and code=upper(trim(coupon_code)) and is_active
      and starts_at<=now() and ends_at>now() and minimum_cents<=subtotal;
    if not found then raise exception 'coupon unavailable'; end if;
    if not coupon.allow_promotions and exists(select 1 from jsonb_array_elements(requested_items) item
      join public.product_variants v on v.id=(item->>'variant_id')::uuid
      where v.compare_at_cents>v.price_cents and (v.promotion_starts_at is null or (now()>=v.promotion_starts_at and now()<v.promotion_ends_at))) then
      raise exception 'coupon cannot be combined with promotions';
    end if;
    discount:=least(subtotal-1,case when coupon.kind='fixed' then coupon.value else floor(subtotal*coupon.value/100.0)::bigint end);
  end if;
  insert into public.customers(organization_id,name,email,phone)
    values(org,checkout_details->>'name',checkout_details->>'email',checkout_details->>'phone') returning id into customer;
  insert into public.orders(id,organization_id,customer_id,subtotal_cents,shipping_cents,discount_cents,total_cents,
    customer_snapshot,shipping_address_snapshot,payment_environment,reservation_id)
  values(checkout_id,org,customer,subtotal,shipping,discount,subtotal+shipping-discount,
    jsonb_build_object('name',checkout_details->>'name','email',checkout_details->>'email','phone',checkout_details->>'phone'),
    checkout_details - 'name' - 'email' - 'phone','sandbox',checkout_id);
  insert into public.order_items(organization_id,order_id,product_id,variant_id,product_name,variant_name,sku,quantity,unit_price_cents,total_cents)
  select org,checkout_id,v.product_id,v.id,p.name,v.name,v.sku,(item->>'quantity')::integer,
    case when v.promotion_starts_at is not null and not(now()>=v.promotion_starts_at and now()<v.promotion_ends_at) then v.compare_at_cents else v.price_cents end,
    (item->>'quantity')::integer * (case when v.promotion_starts_at is not null and not(now()>=v.promotion_starts_at and now()<v.promotion_ends_at) then v.compare_at_cents else v.price_cents end)
  from jsonb_array_elements(requested_items) item join public.product_variants v on v.id=(item->>'variant_id')::uuid
    join public.products p on p.id=v.product_id;
  insert into public.shipments(organization_id,order_id,provider,price_cents) values(org,checkout_id,delivery,shipping);
  insert into public.checkout_sessions(id,fingerprint) values(checkout_id,request_fingerprint);
  return jsonb_build_object('reused',false,'orderId',checkout_id,'subtotalCents',subtotal,'discountCents',discount,'shippingCents',shipping);
end;
$$;
revoke all on function public.create_sandbox_order(text,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_sandbox_order(text,uuid,text,jsonb,jsonb,text) to service_role;
