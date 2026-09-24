-- Atomic catalog administration. Product, variants, image metadata, inventory
-- history and audit history are committed together under tenant-aware RLS.
create or replace function public.save_product_catalog(
  target_organization_id uuid,
  target_product_id uuid,
  product_category_id uuid,
  product_slug text,
  product_name text,
  product_description text,
  product_featured boolean,
  next_status public.product_status,
  variant_payload jsonb,
  image_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_product_id uuid;
  variant_record jsonb;
  image_record jsonb;
  saved_variant_id uuid;
  existing_stock integer;
  next_stock integer;
  touched_variant_ids uuid[] := array[]::uuid[];
  is_new boolean := target_product_id is null;
begin
  if not private.can_manage_catalog(target_organization_id) then
    raise exception 'not authorized';
  end if;

  if trim(product_name) = '' or product_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid product identity';
  end if;

  if jsonb_typeof(variant_payload) <> 'array' or jsonb_array_length(variant_payload) = 0 then
    raise exception 'at least one variant is required';
  end if;

  if jsonb_array_length(variant_payload) > 100 then
    raise exception 'a product supports at most 100 variants';
  end if;

  if (select count(distinct upper(trim(value->>'sku'))) from jsonb_array_elements(variant_payload))
    <> jsonb_array_length(variant_payload) then
    raise exception 'variant SKUs must be unique';
  end if;

  if jsonb_typeof(image_payload) <> 'array' then
    raise exception 'image payload must be an array';
  end if;

  if jsonb_array_length(image_payload) > 8 then
    raise exception 'a product supports at most 8 images';
  end if;

  if (select count(distinct value->>'storagePath') from jsonb_array_elements(image_payload))
    <> jsonb_array_length(image_payload)
    or (select count(distinct (value->>'sortOrder')::integer) from jsonb_array_elements(image_payload))
    <> jsonb_array_length(image_payload)
    or exists (
      select 1 from jsonb_array_elements(image_payload)
      where (value->>'sortOrder')::integer < 0
        or (value->>'sortOrder')::integer >= jsonb_array_length(image_payload)
    ) then
    raise exception 'image paths and order must be unique and contiguous';
  end if;

  if next_status = 'active' and jsonb_array_length(image_payload) = 0 then
    raise exception 'an active product requires an image';
  end if;

  if is_new then
    insert into public.products (
      organization_id, category_id, slug, name, description, featured, status
    ) values (
      target_organization_id, product_category_id, product_slug, trim(product_name),
      nullif(trim(product_description), ''), product_featured, next_status
    ) returning id into saved_product_id;
  else
    update public.products
    set category_id = product_category_id,
        slug = product_slug,
        name = trim(product_name),
        description = nullif(trim(product_description), ''),
        featured = product_featured,
        status = next_status
    where id = target_product_id
      and organization_id = target_organization_id
    returning id into saved_product_id;

    if saved_product_id is null then
      raise exception 'product not found';
    end if;
  end if;

  -- Phase 1 blocks direct stock writes. This transaction is the audited
  -- catalog operation allowed to update balances and record their deltas.
  perform set_config('l7.inventory_write', 'allowed', true);

  for variant_record in select value from jsonb_array_elements(variant_payload)
  loop
    if trim(coalesce(variant_record->>'sku', '')) = ''
      or trim(coalesce(variant_record->>'name', '')) = ''
      or coalesce((variant_record->>'priceCents')::bigint, -1) < 0
      or coalesce((variant_record->>'stock')::integer, -1) < 0 then
      raise exception 'invalid variant';
    end if;

    if variant_record->>'compareAtCents' is not null
      and (variant_record->>'compareAtCents')::bigint < (variant_record->>'priceCents')::bigint then
      raise exception 'compare-at price must be greater than or equal to price';
    end if;

    next_stock := (variant_record->>'stock')::integer;
    if nullif(variant_record->>'id', '') is not null then
      saved_variant_id := (variant_record->>'id')::uuid;
      select stock_quantity into existing_stock
      from public.product_variants
      where id = saved_variant_id
        and product_id = saved_product_id
        and organization_id = target_organization_id
      for update;

      if existing_stock is null then
        raise exception 'variant not found';
      end if;

      update public.product_variants
      set sku = upper(trim(variant_record->>'sku')),
          name = trim(variant_record->>'name'),
          color = nullif(trim(variant_record->>'color'), ''),
          size = nullif(trim(variant_record->>'size'), ''),
          price_cents = (variant_record->>'priceCents')::bigint,
          compare_at_cents = (variant_record->>'compareAtCents')::bigint,
          stock_quantity = next_stock,
          is_active = true
      where id = saved_variant_id;

      if next_stock <> existing_stock then
        insert into public.inventory_movements (
          organization_id, variant_id, quantity_delta, reason, note, actor_user_id
        ) values (
          target_organization_id, saved_variant_id, next_stock - existing_stock,
          'adjustment', 'Ajuste realizado no editor de produto', (select auth.uid())
        );
      end if;
    else
      saved_variant_id := null;
      existing_stock := null;
      select id, stock_quantity into saved_variant_id, existing_stock
      from public.product_variants
      where organization_id = target_organization_id
        and product_id = saved_product_id
        and sku = upper(trim(variant_record->>'sku'))
        and not is_active
      for update;

      if saved_variant_id is not null then
        update public.product_variants
        set name = trim(variant_record->>'name'),
            color = nullif(trim(variant_record->>'color'), ''),
            size = nullif(trim(variant_record->>'size'), ''),
            price_cents = (variant_record->>'priceCents')::bigint,
            compare_at_cents = (variant_record->>'compareAtCents')::bigint,
            stock_quantity = next_stock,
            is_active = true
        where id = saved_variant_id;
      else
        insert into public.product_variants (
          organization_id, product_id, sku, name, color, size,
          price_cents, compare_at_cents, stock_quantity, is_active
        ) values (
          target_organization_id, saved_product_id, upper(trim(variant_record->>'sku')),
          trim(variant_record->>'name'), nullif(trim(variant_record->>'color'), ''),
          nullif(trim(variant_record->>'size'), ''),
          (variant_record->>'priceCents')::bigint,
          (variant_record->>'compareAtCents')::bigint,
          next_stock, true
        ) returning id into saved_variant_id;
        existing_stock := 0;
      end if;

      if next_stock <> existing_stock then
        insert into public.inventory_movements (
          organization_id, variant_id, quantity_delta, reason, note, actor_user_id
        ) values (
          target_organization_id, saved_variant_id, next_stock - existing_stock,
          case when is_new then 'initial'::public.inventory_reason else 'adjustment'::public.inventory_reason end,
          case when is_new then 'Estoque informado no cadastro do produto' else 'Variação reativada no editor de produto' end,
          (select auth.uid())
        );
      end if;
    end if;

    touched_variant_ids := array_append(touched_variant_ids, saved_variant_id);
  end loop;

  update public.product_variants
  set is_active = false
  where product_id = saved_product_id
    and organization_id = target_organization_id
    and not (id = any(touched_variant_ids));

  delete from public.product_images
  where product_id = saved_product_id
    and organization_id = target_organization_id;

  for image_record in select value from jsonb_array_elements(image_payload)
  loop
    if coalesce(image_record->>'storagePath', '') !~ ('^' || target_organization_id::text || '/products/') then
      raise exception 'invalid image path';
    end if;

    insert into public.product_images (
      organization_id, product_id, storage_path, alt_text, sort_order
    ) values (
      target_organization_id, saved_product_id, image_record->>'storagePath',
      coalesce(nullif(trim(image_record->>'alt'), ''), trim(product_name)),
      coalesce((image_record->>'sortOrder')::integer, 0)
    );
  end loop;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_organization_id, (select auth.uid()),
    case when is_new then 'product.created' else 'product.updated' end,
    'product', saved_product_id,
    jsonb_build_object(
      'status', next_status,
      'variant_count', jsonb_array_length(variant_payload),
      'image_count', jsonb_array_length(image_payload)
    )
  );

  return saved_product_id;
end;
$$;

create or replace function public.set_product_status(
  target_organization_id uuid,
  target_product_id uuid,
  next_status public.product_status
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.can_manage_catalog(target_organization_id) then
    raise exception 'not authorized';
  end if;

  if next_status = 'active' and (
    not exists (
      select 1 from public.product_variants variant
      where variant.product_id = target_product_id
        and variant.organization_id = target_organization_id
        and variant.is_active
    )
    or not exists (
      select 1 from public.product_images image
      where image.product_id = target_product_id
        and image.organization_id = target_organization_id
    )
  ) then
    raise exception 'an active product requires a variant and an image';
  end if;

  update public.products
  set status = next_status
  where id = target_product_id
    and organization_id = target_organization_id;

  if not found then
    raise exception 'product not found';
  end if;

  -- products_audit_status_change, created in Phase 1, records this transition.
end;
$$;

revoke all on function public.save_product_catalog(uuid, uuid, uuid, text, text, text, boolean, public.product_status, jsonb, jsonb) from public, anon;
revoke all on function public.set_product_status(uuid, uuid, public.product_status) from public, anon;
grant execute on function public.save_product_catalog(uuid, uuid, uuid, text, text, text, boolean, public.product_status, jsonb, jsonb) to authenticated;
grant execute on function public.set_product_status(uuid, uuid, public.product_status) to authenticated;
