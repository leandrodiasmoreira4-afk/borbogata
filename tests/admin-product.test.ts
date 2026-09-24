import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminProductDraft } from "../lib/catalog/admin-product.ts";

const baseDraft = {
  name: "Vestido Luna",
  slug: "vestido-luna",
  description: "Vestido midi com caimento leve.",
  categoryId: null,
  featured: true,
  status: "draft" as const,
  variants: [
    { sku: "LUNA-P", name: "Preto / P", color: "Preto", size: "P", price: "189,90", compareAt: "229,90", stock: "2" },
  ],
};

test("converte valores monetários para centavos inteiros", () => {
  const result = parseAdminProductDraft(baseDraft);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.variants[0].priceCents, 18_990);
  assert.equal(result.data.variants[0].compareAtCents, 22_990);
});

test("rejeita preço promocional maior que o preço anterior", () => {
  const result = parseAdminProductDraft({
    ...baseDraft,
    variants: [{ ...baseDraft.variants[0], price: "239,90", compareAt: "229,90" }],
  });
  assert.equal(result.success, false);
});

test("rejeita SKU duplicado dentro do produto", () => {
  const result = parseAdminProductDraft({
    ...baseDraft,
    variants: [baseDraft.variants[0], { ...baseDraft.variants[0], size: "M" }],
  });
  assert.equal(result.success, false);
});

test("rejeita slug, estoque e produto sem variações válidas", () => {
  assert.equal(parseAdminProductDraft({ ...baseDraft, slug: "Vestido Luna" }).success, false);
  assert.equal(parseAdminProductDraft({ ...baseDraft, variants: [{ ...baseDraft.variants[0], stock: "-1" }] }).success, false);
  assert.equal(parseAdminProductDraft({ ...baseDraft, variants: [] }).success, false);
});

test("limita a quantidade de variações também no cliente", () => {
  const variants = Array.from({ length: 101 }, (_, index) => ({
    ...baseDraft.variants[0],
    sku: `LUNA-${index}`,
  }));
  assert.equal(parseAdminProductDraft({ ...baseDraft, variants }).success, false);
});
