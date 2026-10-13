-- Administrative queries retain RLS and never combine sandbox with real sales.
create index payments_organization_paid_at_idx on public.payments(organization_id, paid_at);
create index orders_organization_environment_created_idx on public.orders(organization_id, payment_environment, created_at desc, id);

create function public.admin_sales_report(target_organization_id uuid, first_day date, last_day date, environment text default 'production')
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; since_time timestamptz; until_time timestamptz;
begin
  if not private.can_manage_orders(target_organization_id) then raise exception 'not authorized'; end if;
  if first_day is null or last_day is null or last_day < first_day or last_day-first_day > 365
    or environment is null or environment not in ('production','sandbox','legacy') then raise exception 'invalid report filters'; end if;
  since_time := first_day::timestamp at time zone 'America/Sao_Paulo';
  until_time := (last_day+1)::timestamp at time zone 'America/Sao_Paulo';
  with order_days as (
    select (o.created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*) as orders, sum(o.total_cents) as order_cents,
      count(*) filter(where o.status='pending') as pending,
      count(*) filter(where o.payment_review_required) as review
    from public.orders o where o.organization_id=target_organization_id
      and coalesce(o.payment_environment,'legacy')=environment and o.created_at>=since_time and o.created_at<until_time
    group by 1
  ), payment_days as (
    select (p.paid_at at time zone 'America/Sao_Paulo')::date as day,
      count(distinct p.order_id) as paid_orders, sum(p.amount_cents) as approved_cents,
      sum(case when p.status='refunded' then p.amount_cents else p.refunded_cents end) as refunded_cents
    from public.payments p join public.orders o on o.id=p.order_id and o.organization_id=p.organization_id
    where p.organization_id=target_organization_id and coalesce(o.payment_environment,'legacy')=environment
      and p.paid_at>=since_time and p.paid_at<until_time and p.status in ('paid','refunded')
    group by 1
  ), days as (
    select first_day+n as day, coalesce(o.orders,0) as orders, coalesce(o.order_cents,0) as order_cents,
      coalesce(o.pending,0) as pending, coalesce(o.review,0) as review,
      coalesce(p.paid_orders,0) as paid_orders, coalesce(p.approved_cents,0) as approved_cents,
      coalesce(p.refunded_cents,0) as refunded_cents,
      coalesce(p.approved_cents,0)-coalesce(p.refunded_cents,0) as net_cents
    from generate_series(0,last_day-first_day) n
    left join order_days o on o.day=first_day+n left join payment_days p on p.day=first_day+n
  ) select jsonb_build_object('days',jsonb_agg(to_jsonb(days) order by day),
    'orders',sum(orders),'order_cents',sum(order_cents),'pending',sum(pending),'review',sum(review),
    'paid_orders',(select count(distinct p.order_id) from public.payments p join public.orders o on o.id=p.order_id and o.organization_id=p.organization_id
      where p.organization_id=target_organization_id and coalesce(o.payment_environment,'legacy')=environment
        and p.paid_at>=since_time and p.paid_at<until_time and p.status in ('paid','refunded')),
    'approved_cents',sum(approved_cents),'refunded_cents',sum(refunded_cents),'net_cents',sum(net_cents)) into result from days;
  return result;
end;
$$;
revoke all on function public.admin_sales_report(uuid,date,date,text) from public,anon;
grant execute on function public.admin_sales_report(uuid,date,date,text) to authenticated;

create function public.admin_orders_page(target_organization_id uuid, search_text text default '', status_filter text default '',
  first_day date default null, last_day date default null, page_number integer default 0, customer_filter uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not private.can_manage_orders(target_organization_id) then raise exception 'not authorized'; end if;
  if page_number is null or page_number<0 or page_number>100000 or length(search_text)>100
    or (first_day is not null and last_day is not null and last_day<first_day)
    or status_filter not in ('','pending','confirmed','processing','shipped','delivered','cancelled') then raise exception 'invalid filters'; end if;
  with matching as (
    select o.id,o.order_number,o.total_cents,o.status,o.created_at,o.customer_snapshot,o.payment_environment,o.payment_review_required
    from public.orders o where o.organization_id=target_organization_id
      and (customer_filter is null or o.customer_id=customer_filter)
      and (status_filter='' or o.status::text=status_filter)
      and (first_day is null or o.created_at>=first_day::timestamp at time zone 'America/Sao_Paulo')
      and (last_day is null or o.created_at<(last_day+1)::timestamp at time zone 'America/Sao_Paulo')
      and (coalesce(search_text,'')='' or strpos(lower(coalesce(o.customer_snapshot->>'name','')||' '||coalesce(o.customer_snapshot->>'email','')||' #'||o.order_number),lower(trim(search_text)))>0)
  ), paged as (select * from matching order by created_at desc,id desc limit 25 offset page_number*25)
  select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(paged) order by created_at desc,id desc) from paged),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.admin_orders_page(uuid,text,text,date,date,integer,uuid) from public,anon;
grant execute on function public.admin_orders_page(uuid,text,text,date,date,integer,uuid) to authenticated;

create function public.admin_customers_page(target_organization_id uuid, search_text text default '', page_number integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not private.can_manage_orders(target_organization_id) then raise exception 'not authorized'; end if;
  if page_number is null or page_number<0 or page_number>100000 or length(search_text)>100 then raise exception 'invalid filters'; end if;
  with matching as (
    select c.id,c.name,c.email,c.phone,c.created_at from public.customers c
    where c.organization_id=target_organization_id and (coalesce(search_text,'')='' or
      strpos(lower(coalesce(c.name,'')||' '||coalesce(c.email,'')||' '||coalesce(c.phone,'')),lower(trim(search_text)))>0)
  ), paged as (select * from matching order by created_at desc,id desc limit 25 offset page_number*25)
  select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(paged) order by created_at desc,id desc) from paged),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.admin_customers_page(uuid,text,integer) from public,anon;
grant execute on function public.admin_customers_page(uuid,text,integer) to authenticated;

create function public.admin_save_customer(target_organization_id uuid, target_customer_id uuid, customer_name text, customer_email text, customer_phone text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare saved_id uuid;
begin
  if not private.can_manage_orders(target_organization_id) then raise exception 'not authorized'; end if;
  if customer_name is null or length(trim(customer_name)) not between 2 and 120
    or length(coalesce(customer_email,''))>254 or (coalesce(customer_email,'')<>'' and customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or (coalesce(customer_phone,'')<>'' and customer_phone !~ '^\+?[0-9 ()-]{8,25}$') then raise exception 'invalid customer'; end if;
  if target_customer_id is null then
    insert into public.customers(organization_id,name,email,phone) values(target_organization_id,trim(customer_name),nullif(lower(trim(customer_email)),''),nullif(trim(customer_phone),'')) returning id into saved_id;
  else
    update public.customers set name=trim(customer_name),email=nullif(lower(trim(customer_email)),''),phone=nullif(trim(customer_phone),'')
      where id=target_customer_id and organization_id=target_organization_id returning id into saved_id;
    if not found then raise exception 'customer not found'; end if;
  end if;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id)
    values(target_organization_id,auth.uid(),'customer.saved','customer',saved_id);
  return saved_id;
end;
$$;
revoke all on function public.admin_save_customer(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.admin_save_customer(uuid,uuid,text,text,text) to authenticated;

create function public.update_collection_with_products(target_organization_id uuid, target_collection_id uuid,
  collection_name text, collection_description text, collection_cover_storage_path text, collection_launched_at date,
  product_ids uuid[], make_featured boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
declare current_status public.product_status;
begin
  if not private.can_manage_catalog(target_organization_id) then raise exception 'not authorized'; end if;
  select status into current_status from public.collections where id=target_collection_id and organization_id=target_organization_id for update;
  if not found then raise exception 'collection not found'; end if;
  if collection_name is null or length(trim(collection_name)) not between 2 and 80 or length(coalesce(collection_description,''))>2000
    or collection_launched_at is null or collection_cover_storage_path is null
    or split_part(collection_cover_storage_path,'/',1)<>target_organization_id::text
    or coalesce(cardinality(product_ids),0)=0 or cardinality(product_ids)>500
    or (select count(distinct x) from unnest(product_ids) x)<>cardinality(product_ids)
    or exists(select 1 from unnest(product_ids) x left join public.products p on p.id=x and p.organization_id=target_organization_id where p.id is null)
    then raise exception 'invalid collection'; end if;
  if make_featured and current_status='archived' then raise exception 'reactivate before featuring'; end if;
  if make_featured then update public.collections set is_featured=false where organization_id=target_organization_id and is_featured and id<>target_collection_id; end if;
  update public.collections set name=trim(collection_name),description=nullif(trim(collection_description),''),
    cover_storage_path=collection_cover_storage_path,launched_at=collection_launched_at,is_featured=make_featured
    where id=target_collection_id and organization_id=target_organization_id;
  delete from public.collection_products where collection_id=target_collection_id and organization_id=target_organization_id;
  insert into public.collection_products(organization_id,collection_id,product_id,sort_order)
    select target_organization_id,target_collection_id,x,n-1 from unnest(product_ids) with ordinality selected(x,n);
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(target_organization_id,auth.uid(),'collection.updated','collection',target_collection_id,jsonb_build_object('product_count',cardinality(product_ids)));
end;
$$;
revoke all on function public.update_collection_with_products(uuid,uuid,text,text,text,date,uuid[],boolean) from public,anon;
grant execute on function public.update_collection_with_products(uuid,uuid,text,text,text,date,uuid[],boolean) to authenticated;
