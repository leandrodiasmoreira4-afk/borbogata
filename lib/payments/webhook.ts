import type { PaymentConfig } from "./config.ts";

export async function verifyPaymentSignature(dataId: string, requestId: string | null, signature: string | null, secret: string): Promise<boolean> {
  if (!/^\d{1,30}$/.test(dataId) || !requestId || requestId.length > 200 || !signature || !secret) return false;
  const parts = signature.split(",").map(part => part.trim().split("="));
  if (parts.length !== 2 || parts.some(part => part.length !== 2)) return false;
  const fields = Object.fromEntries(parts);
  if (!/^\d{1,16}$/.test(fields.ts || "") || !/^[a-f0-9]{64}$/i.test(fields.v1 || "")) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = new Uint8Array((fields.v1 as string).match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
  // Retries may be delayed by the provider. Deduplicate the verified resource version in the database.
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(`id:${dataId};request-id:${requestId};ts:${fields.ts};`));
}

export type VerifiedPayment = {
  id: string; orderId: string; status: string; amountCents: number;
  refundedCents: number; updatedAt: string; liveMode: false;
};

/** Only the authenticated provider response is authoritative, never webhook body/back_url. */
export async function fetchVerifiedPayment(id: string, config: PaymentConfig, fetcher: typeof fetch = fetch): Promise<VerifiedPayment> {
  if (!/^\d{1,30}$/.test(id)) throw new Error("Pagamento inválido.");
  const response = await fetcher(`https://api.mercadopago.com/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
    signal: AbortSignal.timeout(10000), cache: "no-store", redirect: "error",
  });
  if (!response.ok) throw new Error("Não foi possível validar o pagamento.");
  const payment = await response.json() as Record<string, unknown>;
  if (!payment || String(payment.id) !== id || payment.live_mode !== false ||
      String(payment.collector_id) !== config.collectorId || payment.currency_id !== "BRL" ||
      typeof payment.external_reference !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payment.external_reference) ||
      typeof payment.status !== "string" || !["pending", "in_process", "authorized", "approved", "rejected", "cancelled", "refunded", "charged_back", "in_mediation"].includes(payment.status) ||
      typeof payment.date_last_updated !== "string" || !Number.isFinite(Date.parse(payment.date_last_updated))) throw new Error("Pagamento incompatível com o ambiente ou pedido.");
  function cents(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw new Error("Valor de pagamento inválido.");
    return Math.round(value * 100);
  }
  const amountCents = cents(payment.transaction_amount);
  const refundedCents = cents(payment.transaction_amount_refunded ?? 0);
  if (amountCents < 1 || refundedCents > amountCents) throw new Error("Valor de pagamento inválido.");
  return { id, orderId: payment.external_reference, status: payment.status, amountCents, refundedCents, updatedAt: new Date(payment.date_last_updated).toISOString(), liveMode: false };
}
