export function effectivePrice(variant: { price_cents: number; compare_at_cents: number | null; promotion_starts_at?: string | null; promotion_ends_at?: string | null }, now = Date.now()) {
  const scheduled = Boolean(variant.promotion_starts_at || variant.promotion_ends_at);
  const active = !scheduled || (Date.parse(variant.promotion_starts_at || "") <= now && now < Date.parse(variant.promotion_ends_at || ""));
  const promotional = active && variant.compare_at_cents !== null && variant.compare_at_cents > variant.price_cents;
  return { price: (active ? variant.price_cents : variant.compare_at_cents ?? variant.price_cents) / 100,
    compareAt: promotional ? variant.compare_at_cents! / 100 : undefined };
}
