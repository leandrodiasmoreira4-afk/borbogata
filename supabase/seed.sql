-- Local/demo data only. Production catalog data must be created through the admin.
insert into public.organizations (slug, name, domain, support_phone, instagram, shipping_origin, brand_config)
values (
  'borbogata',
  'Borbogata',
  'borbogata.com.br',
  '(71) 99999-9999',
  '@borbogata_modas',
  '{"address":"Rua Simões Filhos, 13","district":"Boca do Rio","city":"Salvador","state":"BA"}'::jsonb,
  '{"primary":"#5a2b5b","pink":"#ee5799","lilac":"#a175b2","cyan":"#7acdd4","lime":"#cbdd71","primary_font":"Alkaline Bold","secondary_font":"Acumin Pro ExtraCondensed Bold","slogan":"Ousada e Sem Limites"}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  domain = excluded.domain,
  support_phone = excluded.support_phone,
  instagram = excluded.instagram,
  shipping_origin = excluded.shipping_origin,
  brand_config = excluded.brand_config;

insert into public.categories (organization_id, name, slug, sort_order)
select id, category.name, category.slug, category.sort_order
from public.organizations
cross join (values
  ('Vestidos', 'vestidos', 10),
  ('Macacões', 'macacoes', 20),
  ('Acessórios', 'acessorios', 30)
) as category(name, slug, sort_order)
where organizations.slug = 'borbogata'
on conflict (organization_id, slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order;

insert into public.products (organization_id, category_id, slug, name, description, status, featured)
select organizations.id, categories.id, product.slug, product.name, product.description, 'active', true
from public.organizations
join public.categories on categories.organization_id = organizations.id
join (values
  ('vestidos', 'vestido-luna-creme', 'Vestido Luna', 'Vestido midi com caimento leve, cintura marcada e acabamento delicado.'),
  ('macacoes', 'macacao-noir', 'Macacão Noir', 'Macacão preto de modelagem alongada, decote elegante e tecido encorpado.'),
  ('acessorios', 'bolsa-aurora-vinho', 'Bolsa Aurora', 'Bolsa estruturada em tom vinho com ferragens douradas e alça ajustável.')
) as product(category_slug, slug, name, description) on product.category_slug = categories.slug
where organizations.slug = 'borbogata'
on conflict (organization_id, slug) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  featured = excluded.featured;

insert into public.product_variants (
  organization_id, product_id, sku, name, color, size, price_cents, compare_at_cents, stock_quantity
)
select organizations.id, products.id, variant.sku, variant.name, variant.color, variant.size,
  variant.price_cents, variant.compare_at_cents, variant.stock_quantity
from public.organizations
join public.products on products.organization_id = organizations.id
join (values
  ('vestido-luna-creme', 'LUNA-CREME-P', 'Creme / P', 'Creme', 'P', 18990::bigint, 22990::bigint, 3),
  ('vestido-luna-creme', 'LUNA-CREME-M', 'Creme / M', 'Creme', 'M', 18990::bigint, 22990::bigint, 3),
  ('vestido-luna-creme', 'LUNA-VINHO-G', 'Vinho / G', 'Vinho', 'G', 18990::bigint, 22990::bigint, 2),
  ('macacao-noir', 'NOIR-PRETO-P', 'Preto / P', 'Preto', 'P', 21990::bigint, null::bigint, 2),
  ('macacao-noir', 'NOIR-PRETO-M', 'Preto / M', 'Preto', 'M', 21990::bigint, null::bigint, 3),
  ('bolsa-aurora-vinho', 'AURORA-VINHO', 'Vinho / Único', 'Vinho', 'Único', 13990::bigint, null::bigint, 12)
) as variant(product_slug, sku, name, color, size, price_cents, compare_at_cents, stock_quantity)
  on variant.product_slug = products.slug
where organizations.slug = 'borbogata'
on conflict (organization_id, sku) do update set
  name = excluded.name,
  color = excluded.color,
  size = excluded.size,
  price_cents = excluded.price_cents,
  compare_at_cents = excluded.compare_at_cents,
  stock_quantity = excluded.stock_quantity;
