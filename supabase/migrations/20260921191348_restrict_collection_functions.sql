revoke all on function public.create_collection_with_products(
  uuid, text, text, text, text, date, uuid[], boolean
) from anon;

revoke all on function public.set_featured_collection(uuid, uuid) from anon;
revoke all on function public.set_collection_status(uuid, uuid, public.product_status) from anon;
