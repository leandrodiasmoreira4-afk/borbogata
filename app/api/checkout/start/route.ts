import { z } from "zod";
import { sandboxCheckoutConfig } from "../../../../lib/checkout/sandbox";
import { validateCheckoutDetails, type CheckoutDetails } from "../../../../lib/checkout/details";
import { createSupabaseServiceClient } from "../../../../lib/supabase/server";
import { createPreference } from "../../../../lib/payments/mercado-pago";
import { lookupPostalCode } from "../../../../lib/checkout/postal-code";

const schema = z.object({
  checkoutId: z.string().uuid(), coupon: z.string().trim().max(40).default(""),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(30),
  details: z.object({ name: z.string().max(120), email: z.string().max(254), phone: z.string().max(30),
    delivery: z.enum(["pickup","courier","correios"]), postalCode: z.string().max(9).optional(), street: z.string().max(200).optional(),
    number: z.string().max(30).optional(), complement: z.string().max(200).optional(), district: z.string().max(120).optional(),
    city: z.string().max(120).optional(), state: z.string().max(2).optional(), recipientName: z.string().max(120).optional(), recipientDocument: z.string().max(14).optional() }),
});

export async function POST(request: Request) {
  let config;
  try { config = sandboxCheckoutConfig(process.env); } catch { return Response.json({ error: "Checkout de testes ainda não configurado." }, { status: 503 }); }
  if (request.headers.get("origin") !== config.siteUrl) return Response.json({ error: "Origem inválida." }, { status: 403 });
  // Streaming bound also covers chunked requests, without trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  let raw = ""; let size = 0; const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16384) { await reader.cancel(); return Response.json({ error: "Requisição muito grande." }, { status: 413 }); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({ error: "Revise os dados do checkout." }, { status: 400 });
    const body = parsed.data;
    const validation = validateCheckoutDetails(body.details as CheckoutDetails);
    if (validation) return Response.json({ error: validation }, { status: 400 });
    if (body.details.delivery !== "pickup") {
      const address = await lookupPostalCode(body.details.postalCode || "");
      if (address.city.toLocaleLowerCase("pt-BR") !== body.details.city?.trim().toLocaleLowerCase("pt-BR") || address.state !== body.details.state?.trim().toUpperCase()) {
        return Response.json({ error: "O CEP não corresponde à cidade e UF informadas." }, { status: 400 });
      }
    }
    const quantities = new Map<string, number>();
    for (const item of body.items) quantities.set(item.variantId, (quantities.get(item.variantId) || 0) + item.quantity);
    if ([...quantities.values()].some(quantity => quantity > 99)) return Response.json({ error: "Quantidade inválida." }, { status: 400 });
    const items = [...quantities].sort(([a],[b]) => a.localeCompare(b)).map(([variant_id, quantity]) => ({ variant_id, quantity }));
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ items, details: body.details, coupon: body.coupon.toUpperCase() })));
    const fingerprint = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,"0")).join("");
    const client = createSupabaseServiceClient();
    const { data: order, error } = await client.rpc("create_sandbox_order", { store_slug: process.env.NEXT_PUBLIC_STORE_SLUG || "borbogata",
      checkout_id: body.checkoutId, request_fingerprint: fingerprint, requested_items: items, checkout_details: body.details, coupon_code: body.coupon });
    if (error || !order) return Response.json({ error: "Confira estoque, cupom e entrega. O pedido não pôde ser iniciado." }, { status: 409 });
    if (order.reused) {
      if (!order.paymentUrl) return Response.json({ error: "Pagamento em preparação ou aguardando revisão. Não repita com outro identificador." }, { status: 409 });
      return Response.json({ paymentUrl: order.paymentUrl, orderId: body.checkoutId, shippingCents: Number(order.shippingCents), discountCents: Number(order.discountCents), totalCents: Number(order.subtotalCents) + Number(order.shippingCents) - Number(order.discountCents) }, { headers: { "Cache-Control": "no-store" } });
    }
    const preference = await createPreference({ orderId: body.checkoutId, payerEmail: body.details.email,
      items: [{ variantId: body.checkoutId, name: "Pedido Borbogata (teste)", quantity: 1, unitPriceCents: Number(order.subtotalCents) - Number(order.discountCents) }],
      shippingCents: Number(order.shippingCents), siteUrl: config.siteUrl }, config.payment.accessToken);
    const { error: saveError } = await client.from("checkout_sessions").update({ payment_url: preference.paymentUrl, preference_id: preference.preferenceId }).eq("id", body.checkoutId);
    if (saveError) throw new Error("persist preference");
    return Response.json({ paymentUrl: preference.paymentUrl, orderId: body.checkoutId, shippingCents: Number(order.shippingCents), discountCents: Number(order.discountCents), totalCents: Number(order.subtotalCents) + Number(order.shippingCents) - Number(order.discountCents) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível iniciar o checkout. Se o pedido já foi criado, aguarde a revisão ou a expiração da reserva." }, { status: 503 });
  }
}
