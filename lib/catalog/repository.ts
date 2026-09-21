import { products as demoProducts, type Product } from "../../app/data/products";
import { storeConfig } from "../../app/config/store";
import { createSupabasePublicClient } from "../supabase/public";

type CatalogRow = {
  slug: string;
  name: string;
  description: string | null;
  categories: { name: string } | null;
  product_variants: Array<{
    color: string | null;
    size: string | null;
    price_cents: number;
    compare_at_cents: number | null;
    stock_quantity: number;
  }>;
};

export type CatalogResult = {
  products: Product[];
  source: "database" | "demo";
  error?: string;
};

export type StoreCollection = {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverImage: string;
  launchedAt: string;
  isFeatured: boolean;
  products: Product[];
};

export type CollectionsResult = {
  collections: StoreCollection[];
  featured: StoreCollection | null;
  source: "database" | "demo";
  error?: string;
};

type CollectionRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_storage_path: string | null;
  launched_at: string;
  is_featured: boolean;
};

type CollectionProductRow = {
  collection_id: string;
  sort_order: number;
  products: { slug: string } | null;
};

export async function getCatalog(): Promise<CatalogResult> {
  const supabase = createSupabasePublicClient();
  if (!supabase) return { products: demoProducts, source: "demo" };

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", storeConfig.organizationSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (organizationError || !organization) {
    return { products: [], source: "database", error: "Loja indisponível no momento." };
  }

  const { data, error } = await supabase
    .from("products")
    .select("slug,name,description,categories(name),product_variants(color,size,price_cents,compare_at_cents,stock_quantity)")
    .eq("organization_id", organization.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return { products: [], source: "database", error: "Não foi possível carregar o catálogo." };

  const rows = (data || []) as unknown as CatalogRow[];
  const products = rows.flatMap((row): Product[] => {
    const variants = row.product_variants || [];
    const available = variants.filter((variant) => variant.stock_quantity > 0);
    const priceSource = available.length ? available : variants;
    if (!priceSource.length) return [];
    const lowest = priceSource.reduce((current, variant) => variant.price_cents < current.price_cents ? variant : current);
    return [{
      slug: row.slug,
      name: row.name,
      category: row.categories?.name || "Coleção",
      price: lowest.price_cents / 100,
      compareAt: lowest.compare_at_cents ? lowest.compare_at_cents / 100 : undefined,
      image: demoProducts.find((item) => item.slug === row.slug)?.image || "/products/vestido-luna.png",
      description: row.description || "",
      sizes: [...new Set(variants.map((variant) => variant.size).filter((value): value is string => Boolean(value)))],
      colors: [...new Set(variants.map((variant) => variant.color).filter((value): value is string => Boolean(value)))],
      stock: variants.reduce((total, variant) => total + variant.stock_quantity, 0),
    }];
  });

  return { products, source: "database" };
}

export async function getCatalogProduct(slug: string) {
  const catalog = await getCatalog();
  return { ...catalog, product: catalog.products.find((item) => item.slug === slug) };
}

export async function getCollections(existingCatalog?: CatalogResult): Promise<CollectionsResult> {
  const catalog = existingCatalog || await getCatalog();
  const supabase = createSupabasePublicClient();
  if (!supabase) {
    const featured: StoreCollection = {
      id: "demo-current",
      slug: "colecao-borbogata",
      name: "Coleção Borbogata",
      description: "Peças marcantes para viver cada momento com atitude.",
      coverImage: demoProducts[1]?.image || "/products/macacao-noir.png",
      launchedAt: "2026-03-01",
      isFeatured: true,
      products: demoProducts,
    };
    return { collections: [featured], featured, source: "demo" };
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", storeConfig.organizationSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (organizationError || !organization) {
    return { collections: [], featured: null, source: "database", error: "Loja indisponível no momento." };
  }

  const { data: collectionData, error: collectionError } = await supabase
    .from("collections")
    .select("id,slug,name,description,cover_storage_path,launched_at,is_featured")
    .eq("organization_id", organization.id)
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("launched_at", { ascending: false });

  if (collectionError) {
    return { collections: [], featured: null, source: "database", error: "Não foi possível carregar as coleções." };
  }

  const rows = (collectionData || []) as CollectionRow[];
  if (!rows.length) return { collections: [], featured: null, source: "database" };

  const { data: linkData, error: linkError } = await supabase
    .from("collection_products")
    .select("collection_id,sort_order,products(slug)")
    .in("collection_id", rows.map((row) => row.id))
    .order("sort_order", { ascending: true });

  if (linkError) {
    return { collections: [], featured: null, source: "database", error: "Não foi possível carregar as peças das coleções." };
  }

  const links = (linkData || []) as unknown as CollectionProductRow[];
  const productsBySlug = new Map(catalog.products.map((product) => [product.slug, product]));
  const collections = rows.map((row): StoreCollection => {
    const collectionProducts = links
      .filter((link) => link.collection_id === row.id)
      .map((link) => link.products?.slug ? productsBySlug.get(link.products.slug) : undefined)
      .filter((product): product is Product => Boolean(product));
    const coverImage = row.cover_storage_path
      ? supabase.storage.from("collection-covers").getPublicUrl(row.cover_storage_path).data.publicUrl
      : collectionProducts[0]?.image || "/products/macacao-noir.png";
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description || "",
      coverImage,
      launchedAt: row.launched_at,
      isFeatured: row.is_featured,
      products: collectionProducts,
    };
  });

  return {
    collections,
    featured: collections.find((collection) => collection.isFeatured) || collections[0] || null,
    source: "database",
    error: catalog.error,
  };
}

export async function getCollectionBySlug(slug: string) {
  const result = await getCollections();
  return { ...result, collection: result.collections.find((item) => item.slug === slug) };
}
