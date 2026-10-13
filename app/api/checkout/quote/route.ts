import { getCatalog } from "../../../../lib/catalog/repository";
import { quoteCart, type DeliveryMethod } from "../../../../lib/checkout/quote";
import type { CartItem } from "../../../../lib/cart/model";
import { sandboxCheckoutConfig } from "../../../../lib/checkout/sandbox";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!body || typeof body !== "object" || !Array.isArray((body as { items?: unknown }).items)) {
    return Response.json({ error: "Carrinho inválido." }, { status: 400 });
  }
  const delivery = (body as { delivery?: DeliveryMethod }).delivery;
  if (!delivery || !["pickup", "courier", "correios"].includes(delivery)) {
    return Response.json({ error: "Escolha uma forma de entrega válida." }, { status: 400 });
  }
  const catalog = await getCatalog();
  if (catalog.error) return Response.json({ error: catalog.error }, { status: 503 });
  try {
    const quote = quoteCart((body as { items: CartItem[] }).items, catalog.products);
    let paymentAvailable = false;
    try { sandboxCheckoutConfig(process.env); paymentAvailable = catalog.source === "database"; } catch { /* Preview remains available. */ }
    return Response.json({ ...quote, source: catalog.source, delivery, deliveryFeeCents: null, paymentAvailable }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Carrinho inválido." }, { status: 400 });
  }
}
