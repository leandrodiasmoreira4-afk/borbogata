export function availableStock(stockQuantity: number, reservedQuantity = 0) {
  if (!Number.isInteger(stockQuantity) || !Number.isInteger(reservedQuantity)) return 0;
  return Math.max(stockQuantity - reservedQuantity, 0);
}

export type ReservationItem = {
  variantId: string;
  quantity: number;
};

export function normalizeReservationItems(items: ReservationItem[]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item.variantId || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
    quantities.set(item.variantId, (quantities.get(item.variantId) || 0) + item.quantity);
  }
  return [...quantities.entries()]
    .map(([variantId, quantity]) => ({ variantId, quantity }))
    .sort((first, second) => first.variantId.localeCompare(second.variantId));
}

export function canReserve(stockQuantity: number, reservedQuantity: number, requestedQuantity: number) {
  return Number.isInteger(requestedQuantity)
    && requestedQuantity > 0
    && availableStock(stockQuantity, reservedQuantity) >= requestedQuantity;
}
