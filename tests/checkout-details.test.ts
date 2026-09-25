import assert from "node:assert/strict";
import test from "node:test";
import { isValidCPF, validateCheckoutDetails } from "../lib/checkout/details.ts";
import type { CheckoutDetails } from "../lib/checkout/details.ts";

const customer: CheckoutDetails = { name: "Maria Silva", email: "maria@example.com", phone: "(71) 99999-1234", delivery: "pickup" };
const address = { postalCode: "41770-235", street: "Rua A", number: "10", district: "STIEP", city: "Salvador", state: "BA" };

test("retirada exige contato válido e dispensa endereço", () => {
  assert.equal(validateCheckoutDetails(customer), null);
  assert.match(validateCheckoutDetails({ ...customer, phone: "999" }) || "", /celular/);
});

test("Correios exige endereço completo", () => {
  assert.match(validateCheckoutDetails({ ...customer, delivery: "correios" }) || "", /CEP/);
  assert.equal(validateCheckoutDetails({ ...customer, delivery: "correios", ...address, recipientDocument: "529.982.247-25" }), null);
});

test("motoboy é restrito a Salvador", () => {
  assert.equal(validateCheckoutDetails({ ...customer, delivery: "courier", ...address }), null);
  assert.match(validateCheckoutDetails({ ...customer, delivery: "courier", ...address, city: "Lauro de Freitas" }) || "", /Salvador/);
});

test("Correios exige CPF válido do destinatário; as outras entregas não exigem", () => {
  assert.equal(isValidCPF("529.982.247-25"), true);
  assert.equal(isValidCPF("111.111.111-11"), false);
  assert.match(validateCheckoutDetails({ ...customer, delivery: "correios", ...address }) || "", /CPF/);
  assert.equal(validateCheckoutDetails({ ...customer, delivery: "correios", ...address, recipientDocument: "529.982.247-25" }), null);
  assert.match(validateCheckoutDetails({ ...customer, delivery: "correios", ...address, recipientDocument: "529.982.247-26" }) || "", /CPF/);
  assert.equal(validateCheckoutDetails({ ...customer, delivery: "courier", ...address }), null);
});
