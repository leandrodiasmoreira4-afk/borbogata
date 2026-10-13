import assert from "node:assert/strict";
import test from "node:test";
import { paymentConfig } from "../lib/payments/config.ts";
import { fetchVerifiedPayment, verifyPaymentSignature } from "../lib/payments/webhook.ts";
import { effectivePrice } from "../lib/catalog/promotion.ts";

const config = { mode: "sandbox" as const, accessToken: "test-token", collectorId: "123", webhookSecret: "fixture-secret" };
const payment = { id: 456, collector_id: 123, live_mode: false, currency_id: "BRL", external_reference: "123e4567-e89b-42d3-a456-426614174000", status: "approved", date_last_updated: "2026-10-12T12:00:00Z", transaction_amount: 200, transaction_amount_refunded: 0 };

test("production and incomplete payment settings fail closed", () => {
  for (const mode of [undefined, "disabled", "production", "sandbox"]) assert.throws(() => paymentConfig({ MERCADO_PAGO_MODE: mode }));
});

test("validates HMAC and rejects substitution of payment ID or request ID", async () => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("id:456;request-id:request-1;ts:1704908010;"));
  const signature = `ts=1704908010,v1=${Buffer.from(hash).toString("hex")}`;
  assert.equal(await verifyPaymentSignature("456", "request-1", signature, config.webhookSecret), true);
  assert.equal(await verifyPaymentSignature("457", "request-1", signature, config.webhookSecret), false);
  assert.equal(await verifyPaymentSignature("456", "request-2", signature, config.webhookSecret), false);
  assert.equal(await verifyPaymentSignature("456", null, signature, config.webhookSecret), false);
  assert.equal(await verifyPaymentSignature("456", "request-1", signature + ",ts=1", config.webhookSecret), false);
});

test("retrieves provider state and rejects production, wrong merchant, currency and amount", async () => {
  const result = await fetchVerifiedPayment("456", config, async () => Response.json(payment));
  assert.equal(result.amountCents, 20000);
  for (const change of [{ live_mode: true }, { collector_id: 999 }, { currency_id: "USD" }, { id: 999 }, { transaction_amount: 1.001 }, { transaction_amount_refunded: 201 }, { external_reference: "invalid" }]) {
    await assert.rejects(fetchVerifiedPayment("456", config, async () => Response.json({ ...payment, ...change })));
  }
});

test("promotion begins inclusively and ends exclusively, restoring original price", () => {
  const variant = { price_cents: 20000, compare_at_cents: 30000, promotion_starts_at: "2026-10-12T12:00:00Z", promotion_ends_at: "2026-10-13T12:00:00Z" };
  assert.deepEqual(effectivePrice(variant, Date.parse(variant.promotion_starts_at) - 1), { price: 300, compareAt: undefined });
  assert.deepEqual(effectivePrice(variant, Date.parse(variant.promotion_starts_at)), { price: 200, compareAt: 300 });
  assert.deepEqual(effectivePrice(variant, Date.parse(variant.promotion_ends_at)), { price: 300, compareAt: undefined });
});
