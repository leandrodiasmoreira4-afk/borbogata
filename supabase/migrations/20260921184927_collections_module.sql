create table public.collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 80),
  description text,
  cover_storage_path text,
  status public.product_status not null default 'draft',
  is_featured boolean not null default false,
  launched_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id)
);

alter table public.products
  add constraint products_id_organization_key unique (id, organization_id);

create table public.collection_products (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  collection_id uuid not null,
  product_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (collection_id, product_id),
  foreign key (collection_id, organization_id)
    references public.collections(id, organization_id) on delete cascade,
  foreign key (product_id, organization_id)
    references public.products(id, organization_id) on delete cascade
);

create unique index collections_one_featured_per_organization_idx
  on public.collections (organization_id) where is_featured;
create index collections_storefront_idx
  on public.collections (organization_id, status, launched_at desc);
create index collection_products_product_idx
  on public.collection_products (product_id);
create index collection_products_organization_idx
  on public.collection_products (organization_id);

create trigger collections_updated_at
before update on public.collections
for each row execute function public.set_updated_at();

alter table public.collections enable row level security;
alter table public.collection_products enable row level security;

create policy collections_public_read
on public.collections for select to anon
using (status = 'active');

create policy collections_staff_all
on public.collections for all to authenticated
using (private.can_manage_catalog(organization_id))
with check (private.can_manage_catalog(organization_id));

create policy collection_products_public_read
on public.collection_products for select to anon
using (
  exists (
    select 1 from public.collections c
    where c.id = collection_products.collection_id
      and c.organization_id = collection_products.organization_id
      and c.status = 'active'
  )
  and exists (
    select 1 from public.products p
    where p.id = collection_products.product_id
      and p.organization_id = collection_products.organization_id
      and p.status = 'active'
  )
);

create policy collection_products_staff_all
on public.collection_products for all to authenticated
using (private.can_manage_catalog(organization_id))
with check (private.can_manage_catalog(organization_id));

grant select on public.collections, public.collection_products to anon;
grant select, insert, update, delete on public.collections, public.collection_products to authenticated;

create function public.create_collection_with_products(
  target_organization_id uuid,
  collection_slug text,
  collection_name text,
  collection_description text,
  collection_cover_storage_path text,
  collection_launched_at date,
  product_ids uuid[],
  make_featured boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_collection_id uuid;
begin
  if not private.can_manage_catalog(target_organization_id) then
    raise exception 'not authorized';
  end if;

  if collection_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid collection slug';
  end if;

  if coalesce(array_length(product_ids, 1), 0) = 0 then
    raise exception 'select at least one product';
  end if;

  if exists (
    select 1 from unnest(product_ids) as selected(selected_product_id)
    left join public.products p
      on p.id = selected_product_id and p.organization_id = target_organization_id
    where p.id is null
  ) then
    raise exception 'invalid product selection';
  end if;

  if make_featured then
    update public.collections
    set is_featured = false
    where organization_id = target_organization_id and is_featured;
  end if;

  insert into public.collections (
    organization_id, slug, name, description, cover_storage_path,
    status, is_featured, launched_at
  ) values (
    target_organization_id, collection_slug, collection_name,
    nullif(trim(collection_description), ''), nullif(trim(collection_cover_storage_path), ''),
    'active', make_featured, coalesce(collection_launched_at, current_date)
  ) returning id into created_collection_id;

  insert into public.collection_products (
    organization_id, collection_id, product_id, sort_order
  )
  select target_organization_id, created_collection_id, selected_product_id, product_order - 1
  from unnest(product_ids) with ordinality as selected(selected_product_id, product_order);

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_organization_id, (select auth.uid()), 'collection.created', 'collection',
    created_collection_id, jsonb_build_object('featured', make_featured, 'product_count', array_length(product_ids, 1))
  );

  return created_collection_id;
end;
$$;

create function public.set_featured_collection(
  target_organization_id uuid,
  target_collection_id uuid
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

  if not exists (
    select 1 from public.collections
    where id = target_collection_id and organization_id = target_organization_id
  ) then
    raise exception 'collection not found';
  end if;

  update public.collections
  set is_featured = false
  where organization_id = target_organization_id and is_featured;

  update public.collections
  set is_featured = true, status = 'active'
  where id = target_collection_id and organization_id = target_organization_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id
  ) values (
    target_organization_id, (select auth.uid()), 'collection.featured', 'collection', target_collection_id
  );
end;
$$;

create function public.set_collection_status(
  target_organization_id uuid,
  target_collection_id uuid,
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

  if next_status not in ('active', 'archived') then
    raise exception 'invalid collection status';
  end if;

  update public.collections
  set status = next_status,
      is_featured = case when next_status = 'archived' then false else is_featured end
  where id = target_collection_id and organization_id = target_organization_id;

  if not found then
    raise exception 'collection not found';
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_organization_id, (select auth.uid()), 'collection.status_changed', 'collection',
    target_collection_id, jsonb_build_object('status', next_status)
  );
end;
$$;

revoke all on function public.create_collection_with_products(uuid, text, text, text, text, date, uuid[], boolean) from public, anon;
revoke all on function public.set_featured_collection(uuid, uuid) from public, anon;
revoke all on function public.set_collection_status(uuid, uuid, public.product_status) from public, anon;
grant execute on function public.create_collection_with_products(uuid, text, text, text, text, date, uuid[], boolean) to authenticated;
grant execute on function public.set_featured_collection(uuid, uuid) to authenticated;
grant execute on function public.set_collection_status(uuid, uuid, public.product_status) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'collection-covers', 'collection-covers', true, 8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy collection_covers_staff_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'collection-covers'
  and exists (
    select 1 from public.organization_members m
    where m.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'catalog')
  )
);

create policy collection_covers_staff_select
on storage.objects for select to authenticated
using (
  bucket_id = 'collection-covers'
  and exists (
    select 1 from public.organization_members m
    where m.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'catalog')
  )
);

create policy collection_covers_staff_update
on storage.objects for update to authenticated
using (
  bucket_id = 'collection-covers'
  and exists (
    select 1 from public.organization_members m
    where m.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'catalog')
  )
)
with check (
  bucket_id = 'collection-covers'
  and exists (
    select 1 from public.organization_members m
    where m.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'catalog')
  )
);

create policy collection_covers_staff_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'collection-covers'
  and exists (
    select 1 from public.organization_members m
    where m.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'catalog')
  )
);
