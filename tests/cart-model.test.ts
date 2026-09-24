import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "../app/data/products.ts";
import { addVariantToCart, parseStoredCart, resolveCartItem } from "../lib/cart/model.ts";

const product: Product = {
  slug: "vestido-teste",
  name: "Vestido Teste",
  category: "Vestidos",
  price: 199.9,
  image: "/brand/product-placeholder.svg",
  images: [{ url: "/brand/product-placeholder.svg", alt: "Vestido Teste", sortOrder: 0 }],
  description: "",
  variants: [
    { id: "variant-p", sku: "TESTE-P", name: "Preto / P", color: "Preto", size: "P", price: 199.9, stock: 2 },
  ],
  sizes: ["P"],
  colors: ["Preto"],
  stock: 2,
};

test("descarta conteúdo inválido do armazenamento local", () => {
  assert.deepEqual(parseStoredCart("não é json"), []);
  assert.deepEqual(parseStoredCart(JSON.stringify([{ slug: "x", quantity: 0 }])), []);
});

test("resolve carrinho legado e adiciona variantId", () => {
  const resolved = resolveCartItem({ slug: product.slug, color: "Preto", size: "P", quantity: 1 }, [product]);
  assert.equal(resolved?.item.variantId, "variant-p");
});

test("não aumenta a quantidade acima do estoque", () => {
  const variant = product.variants[0];
  const first = addVariantToCart([], product, variant);
  const second = addVariantToCart(first, product, variant);
  const third = addVariantToCart(second, product, variant);
  assert.equal(third[0].quantity, 2);
});

test("não resolve nem adiciona uma variação esgotada", () => {
  const soldOut = { ...product.variants[0], stock: 0 };
  const soldOutProduct = { ...product, variants: [soldOut], stock: 0 };
  assert.equal(resolveCartItem({ slug: product.slug, variantId: soldOut.id, quantity: 1 }, [soldOutProduct]), null);
  assert.deepEqual(addVariantToCart([], soldOutProduct, soldOut), []);
});
