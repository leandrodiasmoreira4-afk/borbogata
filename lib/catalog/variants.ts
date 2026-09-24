import type { ProductVariant } from "../../app/data/products";

export function availableVariants(variants: ProductVariant[]) {
  return variants.filter((variant) => variant.stock > 0);
}

export function uniqueVariantColors(variants: ProductVariant[]) {
  return unique(variants.map((variant) => variant.color));
}

export function uniqueVariantSizes(variants: ProductVariant[]) {
  return unique(variants.map((variant) => variant.size));
}

export function findAvailableVariant(variants: ProductVariant[], color: string, size: string) {
  return variants.find((variant) => variant.color === color && variant.size === size && variant.stock > 0);
}

export function firstAvailableVariant(variants: ProductVariant[]) {
  return availableVariants(variants)[0];
}

export function sizesAvailableForColor(variants: ProductVariant[], color: string) {
  return new Set(
    availableVariants(variants)
      .filter((variant) => variant.color === color)
      .map((variant) => variant.size),
  );
}

function unique(values: string[]) {
  return [...new Set(values)];
}
