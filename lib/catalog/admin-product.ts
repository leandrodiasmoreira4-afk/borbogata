import { z } from "zod";

const moneySchema = z.string().trim().regex(/^\d+(?:[,.]\d{1,2})?$/, "Informe um valor válido.");

const variantDraftSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().max(80),
  size: z.string().trim().max(40),
  price: moneySchema,
  compareAt: z.string().trim(),
  stock: z.string().trim().regex(/^\d+$/, "O estoque deve ser um número inteiro."),
});

const productDraftSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use um slug válido."),
  description: z.string().trim().max(5000),
  categoryId: z.string().uuid().nullable(),
  featured: z.boolean(),
  status: z.enum(["draft", "active", "archived"]),
  variants: z.array(variantDraftSchema).min(1, "Adicione pelo menos uma variação.").max(100, "Use no máximo 100 variações por produto."),
}).superRefine((value, context) => {
  const skus = new Set<string>();
  value.variants.forEach((variant, index) => {
    const sku = variant.sku.toUpperCase();
    if (skus.has(sku)) context.addIssue({ code: "custom", path: ["variants", index, "sku"], message: "SKU duplicado." });
    skus.add(sku);
    if (variant.compareAt && !moneySchema.safeParse(variant.compareAt).success) {
      context.addIssue({ code: "custom", path: ["variants", index, "compareAt"], message: "Informe um valor válido." });
      return;
    }
    if (variant.compareAt && toCents(variant.compareAt) < toCents(variant.price)) {
      context.addIssue({ code: "custom", path: ["variants", index, "compareAt"], message: "O preço anterior deve ser maior ou igual ao atual." });
    }
  });
});

export type AdminProductDraft = z.input<typeof productDraftSchema>;

export function parseAdminProductDraft(input: AdminProductDraft) {
  const result = productDraftSchema.safeParse(input);
  if (!result.success) return result;
  return {
    success: true as const,
    data: {
      ...result.data,
      variants: result.data.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        color: variant.color || null,
        size: variant.size || null,
        priceCents: toCents(variant.price),
        compareAtCents: variant.compareAt ? toCents(variant.compareAt) : null,
        stock: Number(variant.stock),
      })),
    },
  };
}

export function centsToInput(value: number | null | undefined) {
  return value == null ? "" : (value / 100).toFixed(2).replace(".", ",");
}

function toCents(value: string) {
  return Math.round(Number(value.replace(",", ".")) * 100);
}
