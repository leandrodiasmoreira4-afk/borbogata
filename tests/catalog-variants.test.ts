import assert from "node:assert/strict";
import test from "node:test";
import {
  findAvailableVariant,
  firstAvailableVariant,
  sizesAvailableForColor,
} from "../lib/catalog/variants.ts";
import type { ProductVariant } from "../app/data/products.ts";

const variants: ProductVariant[] = [
  { id: "black-p", sku: "BLACK-P", name: "Preto / P", color: "Preto", size: "P", price: 100, stock: 2 },
  { id: "black-m", sku: "BLACK-M", name: "Preto / M", color: "Preto", size: "M", price: 100, stock: 0 },
  { id: "red-m", sku: "RED-M", name: "Vermelho / M", color: "Vermelho", size: "M", price: 110, stock: 1 },
];

test("seleciona somente uma combinação disponível", () => {
  assert.equal(findAvailableVariant(variants, "Preto", "P")?.id, "black-p");
  assert.equal(findAvailableVariant(variants, "Preto", "M"), undefined);
  assert.equal(findAvailableVariant(variants, "Vermelho", "P"), undefined);
});

test("expõe tamanhos disponíveis por cor", () => {
  assert.deepEqual([...sizesAvailableForColor(variants, "Preto")], ["P"]);
  assert.deepEqual([...sizesAvailableForColor(variants, "Vermelho")], ["M"]);
});

test("ignora variação esgotada ao definir a seleção inicial", () => {
  assert.equal(firstAvailableVariant(variants)?.id, "black-p");
});
