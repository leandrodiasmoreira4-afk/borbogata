import { sandboxCheckoutConfig } from "../../../../../lib/checkout/sandbox";
import { fetchVerifiedPayment, verifyPaymentSignature } from "../../../../../lib/payments/webhook";
import { createSupabaseServiceClient } from "../../../../../lib/supabase/server";

export async function POST(request: Request) {
  let config;
  try { config = sandboxCheckoutConfig(process.env).payment; } catch { return Response.json({ error: "Integração indisponível." }, { status: 503 }); }
  const url = new URL(request.url);
  const id = url.searchParams.get("data.id") || "";
  if (url.searchParams.getAll("data.id").length !== 1 || !await verifyPaymentSignature(id, request.headers.get("x-request-id"), request.headers.get("x-signature"), config.webhookSecret)) {
    return Response.json({ error: "Notificação inválida." }, { status: 401 });
  }
  try {
    const payment = await fetchVerifiedPayment(id, config);
    const client = createSupabaseServiceClient();
    const { error } = await client.rpc("process_verified_sandbox_payment", { verified_payment: payment });
    if (error) throw new Error("reconciliation");
    return Response.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Non-2xx requests are retried. Do not acknowledge failed persistence or expose provider/PII payloads.
    return Response.json({ error: "Não foi possível conciliar a notificação." }, { status: 503 });
  }
}
