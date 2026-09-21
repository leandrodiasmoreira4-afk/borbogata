create index collection_products_collection_organization_idx
  on public.collection_products (collection_id, organization_id);

create index collection_products_product_organization_idx
  on public.collection_products (product_id, organization_id);
