import assert from "node:assert/strict";
import test from "node:test";
import { products } from "../app/data/products.ts";
import { quoteCart } from "../lib/checkout/quote.ts";

test("recalcula o subtotal do catálogo sem confiar em preços enviados pelo cliente", () => {
  const result = quoteCart([{ slug: products[0].slug, variantId: products[0].variants[0].id, quantity: 2, price: 1 } as never], products);
  assert.equal(result.subtotalCents, 37980);
});

test("recusa itens repetidos que juntos excedem o estoque", () => {
  const item = { slug: products[0].slug, variantId: products[0].variants[0].id, quantity: 2 };
  assert.throws(() => quoteCart([item, item], products), /estoque/);
});

test("recusa item inválido e variante indisponível", () => {
  assert.throws(() => quoteCart([null as never], products), /inválido/);
  assert.throws(() => quoteCart([{ slug: products[0].slug, variantId: "inexistente", quantity: 1 }], products), /disponível/);
});
