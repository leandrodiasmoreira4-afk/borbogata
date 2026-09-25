import type { Product } from "../../app/data/products";
import { resolveCartItem, type CartItem } from "../cart/model.ts";

export type DeliveryMethod = "pickup" | "courier" | "correios";

export function quoteCart(items: CartItem[], products: Product[]) {
  if (!items.length || items.length > 30) throw new Error("Carrinho inválido.");
  const quantities = new Map<string, number>();
  const lines = items.map((item) => {
    if (!item || typeof item !== "object" || typeof item.slug !== "string" ||
      (item.variantId !== undefined && typeof item.variantId !== "string") ||
      (item.size !== undefined && typeof item.size !== "string") ||
      (item.color !== undefined && typeof item.color !== "string")) {
      throw new Error("Carrinho inválido.");
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new Error("Quantidade inválida no carrinho.");
    }
    const resolved = resolveCartItem(item, products);
    if (!resolved) throw new Error("Uma peça do carrinho não está mais disponível.");
    const { product, variant } = resolved;
    const quantity = (quantities.get(variant.id) || 0) + item.quantity;
    if (quantity > variant.stock) throw new Error("A quantidade solicitada supera o estoque disponível.");
    quantities.set(variant.id, quantity);
    const unitPriceCents = Math.round(variant.price * 100);
    return { variantId: variant.id, name: product.name, color: variant.color, size: variant.size, quantity: item.quantity, unitPriceCents, totalCents: unitPriceCents * item.quantity };
  });
  return { lines, subtotalCents: lines.reduce((total, line) => total + line.totalCents, 0) };
}
