"use client";

import { ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addVariantToCart, parseStoredCart } from "../../lib/cart/model";
import {
  findAvailableVariant,
  firstAvailableVariant,
  sizesAvailableForColor,
  uniqueVariantColors,
  uniqueVariantSizes,
} from "../../lib/catalog/variants";
import type { Product } from "../data/products";

const CART_STORAGE_KEY = "l7-commerce-cart";

export function AddToCart({ product }: { product: Product }) {
  const firstVariant = useMemo(() => firstAvailableVariant(product.variants), [product.variants]);
  const [selectedVariantId, setSelectedVariantId] = useState(firstVariant?.id ?? "");
  const [added, setAdded] = useState(false);
  const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId) ?? firstVariant;
  const colors = useMemo(() => uniqueVariantColors(product.variants), [product.variants]);
  const sizes = useMemo(() => uniqueVariantSizes(product.variants), [product.variants]);
  const selectedColor = selectedVariant?.color ?? colors[0] ?? "";
  const availableSizes = sizesAvailableForColor(product.variants, selectedColor);

  const selectColor = useCallback((color: string) => {
    const sameSize = selectedVariant
      ? findAvailableVariant(product.variants, color, selectedVariant.size)
      : undefined;
    const next = sameSize ?? product.variants.find((variant) => variant.color === color && variant.stock > 0);
    if (next) setSelectedVariantId(next.id);
  }, [product.variants, selectedVariant]);

  const selectSize = useCallback((size: string) => {
    const next = findAvailableVariant(product.variants, selectedColor, size);
    if (next) setSelectedVariantId(next.id);
  }, [product.variants, selectedColor]);

  const add = useCallback((variantId = selectedVariant?.id) => {
    const variant = product.variants.find((candidate) => candidate.id === variantId && candidate.stock > 0);
    if (!variant) throw new Error("Variação indisponível");
    const current = parseStoredCart(localStorage.getItem(CART_STORAGE_KEY));
    const next = addVariantToCart(current, product, variant);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("cart-updated"));
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
    return {
      product: product.slug,
      variantId: variant.id,
      size: variant.size,
      color: variant.color,
      quantity: 1,
      status: "added",
    };
  }, [product, selectedVariant]);

  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "add_product_to_cart",
      title: "Adicionar produto ao carrinho",
      description: "Adiciona uma variação disponível deste produto ao carrinho.",
      inputSchema: {
        type: "object",
        properties: {
          size: { type: "string", enum: sizes },
          color: { type: "string", enum: colors },
        },
        required: ["size", "color"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const value = input as { size?: string; color?: string };
        const variant = findAvailableVariant(product.variants, value?.color ?? "", value?.size ?? "");
        if (!variant) throw new Error("Esta combinação de tamanho e cor está indisponível");
        return add(variant.id);
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [add, colors, product.variants, sizes]);

  return <div className="buy-box">
    <fieldset>
      <legend>Cor</legend>
      <div className="choice-row">{colors.map((color) => {
        const available = product.variants.some((variant) => variant.color === color && variant.stock > 0);
        return <button type="button" key={color} className={selectedColor === color ? "choice active" : "choice"} disabled={!available} onClick={() => selectColor(color)}>{color}</button>;
      })}</div>
    </fieldset>
    <fieldset>
      <legend>Tamanho</legend>
      <div className="choice-row">{sizes.map((size) => <button type="button" key={size} className={selectedVariant?.size === size ? "choice active" : "choice"} disabled={!availableSizes.has(size)} onClick={() => selectSize(size)}>{size}</button>)}</div>
    </fieldset>
    <button className="primary-button full" disabled={!selectedVariant} onClick={() => add()}>
      <ShoppingBag size={19} />
      {!selectedVariant ? "Produto esgotado" : added ? "Adicionado ao carrinho" : "Adicionar ao carrinho"}
    </button>
  </div>;
}
