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
