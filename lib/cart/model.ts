import type { Product, ProductVariant } from "../../app/data/products";

export type CartItem = {
  slug: string;
  variantId?: string;
  quantity: number;
  size?: string;
  color?: string;
};

export type ResolvedCartItem = {
  item: CartItem;
  product: Product;
  variant: ProductVariant;
};

export function parseStoredCart(value: string | null): CartItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): CartItem[] => {
      if (!isRecord(entry) || typeof entry.slug !== "string") return [];
      const quantity = Number(entry.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) return [];
      return [{
        slug: entry.slug,
        variantId: typeof entry.variantId === "string" ? entry.variantId : undefined,
        size: typeof entry.size === "string" ? entry.size : undefined,
        color: typeof entry.color === "string" ? entry.color : undefined,
        quantity,
      }];
    });
  } catch {
    return [];
  }
}

export function resolveCartItem(item: CartItem, products: Product[]): ResolvedCartItem | null {
  const product = products.find((candidate) => candidate.slug === item.slug);
  if (!product) return null;
  const variant = item.variantId
    ? product.variants.find((candidate) => candidate.id === item.variantId)
    : product.variants.find((candidate) => candidate.size === item.size && candidate.color === item.color);
  if (!variant || variant.stock < 1) return null;
  return { item: { ...item, variantId: variant.id, size: variant.size, color: variant.color }, product, variant };
}

export function addVariantToCart(items: CartItem[], product: Product, variant: ProductVariant) {
  if (variant.stock < 1) return items;
  const index = items.findIndex((item) => item.variantId === variant.id);
  if (index < 0) {
    return [...items, { slug: product.slug, variantId: variant.id, size: variant.size, color: variant.color, quantity: 1 }];
  }
  return items.map((item, itemIndex) => itemIndex === index
    ? { ...item, quantity: Math.min(item.quantity + 1, variant.stock) }
    : item);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
