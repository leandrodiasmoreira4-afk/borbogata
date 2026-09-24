import assert from "node:assert/strict";
import test from "node:test";
import { availableStock, canReserve, normalizeReservationItems } from "../lib/inventory/model.ts";

test("calcula o saldo disponível sem expor quantidade negativa", () => {
  assert.equal(availableStock(8, 3), 5);
  assert.equal(availableStock(2, 4), 0);
});

test("consolida itens repetidos antes de solicitar a reserva", () => {
  assert.deepEqual(normalizeReservationItems([
    { variantId: "variant-b", quantity: 1 },
    { variantId: "variant-a", quantity: 2 },
    { variantId: "variant-b", quantity: 3 },
  ]), [
    { variantId: "variant-a", quantity: 2 },
    { variantId: "variant-b", quantity: 4 },
  ]);
});

test("descarta itens inválidos e exige saldo disponível", () => {
  assert.deepEqual(normalizeReservationItems([
    { variantId: "", quantity: 1 },
    { variantId: "variant-a", quantity: 0 },
    { variantId: "variant-b", quantity: 2 },
  ]), [{ variantId: "variant-b", quantity: 2 }]);
  assert.equal(canReserve(5, 2, 3), true);
  assert.equal(canReserve(5, 2, 4), false);
  assert.equal(canReserve(5, 2, 0), false);
});
