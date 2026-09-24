import {
  products as demoProducts,
  type Product,
  type ProductImage,
  type ProductVariant,
} from "../../app/data/products";
import { storeConfig } from "../../app/config/store";
import { createSupabasePublicClient } from "../supabase/public";
import { availableStock } from "../inventory/model";

type CatalogRow = {
  slug: string;
  name: string;
  description: string | null;
  categories: { name: string } | null;
  product_variants: Array<{
    id: string;
    sku: string;
    name: string;
    color: string | null;
    size: string | null;
    price_cents: number;
    compare_at_cents: number | null;
    stock_quantity: number;
    reserved_quantity: number;
    is_active: boolean;
  }>;
  product_images: Array<{
    storage_path: string;
    alt_text: string;
    sort_order: number;
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
    .select("slug,name,description,categories(name),product_variants(id,sku,name,color,size,price_cents,compare_at_cents,stock_quantity,reserved_quantity,is_active),product_images(storage_path,alt_text,sort_order)")
    .eq("organization_id", organization.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return { products: [], source: "database", error: "Não foi possível carregar o catálogo." };

  const rows = (data || []) as unknown as CatalogRow[];
  const products = rows.flatMap((row): Product[] => {
    const variants: ProductVariant[] = (row.product_variants || [])
      .filter((variant) => variant.is_active)
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        color: variant.color || "Padrão",
        size: variant.size || "Único",
        price: variant.price_cents / 100,
        compareAt: variant.compare_at_cents ? variant.compare_at_cents / 100 : undefined,
        stock: availableStock(variant.stock_quantity, variant.reserved_quantity),
      }));
    const available = variants.filter((variant) => variant.stock > 0);
    const priceSource = available.length ? available : variants;
    if (!priceSource.length) return [];
    const lowest = priceSource.reduce((current, variant) => variant.price < current.price ? variant : current);
    const images: ProductImage[] = (row.product_images || [])
      .sort((first, second) => first.sort_order - second.sort_order)
      .map((image) => ({
        url: supabase.storage.from("product-images").getPublicUrl(image.storage_path).data.publicUrl,
        alt: image.alt_text || row.name,
        sortOrder: image.sort_order,
      }));
    const primaryImage = images[0]?.url || "/brand/product-placeholder.svg";
    return [{
      slug: row.slug,
      name: row.name,
      category: row.categories?.name || "Coleção",
      price: lowest.price,
      compareAt: lowest.compareAt,
      image: primaryImage,
      images: images.length ? images : [{ url: primaryImage, alt: row.name, sortOrder: 0 }],
      description: row.description || "",
      variants,
      sizes: [...new Set(variants.map((variant) => variant.size))],
      colors: [...new Set(variants.map((variant) => variant.color))],
      stock: variants.reduce((total, variant) => total + variant.stock, 0),
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
