import assert from "node:assert/strict";
import test from "node:test";
import { buildPreference, createPreference } from "../lib/payments/mercado-pago.ts";

const input = {
  orderId: "123e4567-e89b-42d3-a456-426614174000",
  payerEmail: "cliente@example.com",
  items: [{ variantId: "sku-1", name: "Produto", quantity: 2, unitPriceCents: 1299 }],
  shippingCents: 750,
  siteUrl: "https://borbogata.example",
};

test("builds a preference with order reference and shipping in reais", () => {
  const preference = buildPreference(input);
  assert.equal(preference.external_reference, input.orderId);
  assert.equal(preference.items[0].unit_price, 12.99);
  assert.deepEqual(preference.shipments, { cost: 7.5, mode: "not_specified" });
  assert.equal(preference.notification_url, "https://borbogata.example/api/payments/mercado-pago/webhook");
});

test("rejects invalid order data before calling the payment provider", async () => {
  let called = false;
  await assert.rejects(createPreference({ ...input, shippingCents: -1 }, "token", async () => {
    called = true;
    return Response.json({});
  }), /Valores do pedido inválidos/);
  assert.equal(called, false);
  assert.throws(() => buildPreference({ ...input, orderId: "invalid" }), /Dados do pedido inválidos/);
  assert.throws(() => buildPreference({ ...input, siteUrl: "http://borbogata.example" }), /HTTPS/);
});

test("accepts only Mercado Pago checkout redirects", async () => {
  const fetcher: typeof fetch = async (_url, options) => {
    assert.equal(options?.method, "POST");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer token");
    return Response.json({ id: "pref-1", init_point: "https://www.mercadopago.com.br/checkout/v1/redirect" });
  };
  assert.deepEqual(await createPreference(input, "token", fetcher), {
    preferenceId: "pref-1", paymentUrl: "https://www.mercadopago.com.br/checkout/v1/redirect",
  });
  await assert.rejects(createPreference(input, "token", async () =>
    Response.json({ id: "pref-1", init_point: "https://mercadopago.com.br.evil.example/redirect" })), /Destino de pagamento inválido/);
});
