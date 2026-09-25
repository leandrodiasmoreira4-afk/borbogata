import { getCatalog } from "../../../../lib/catalog/repository";
import { quoteCart } from "../../../../lib/checkout/quote";
import type { CartItem } from "../../../../lib/cart/model";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!body || typeof body !== "object" || !Array.isArray((body as { items?: unknown }).items)) {
    return Response.json({ error: "Carrinho inválido." }, { status: 400 });
  }
  const catalog = await getCatalog();
  if (catalog.error) return Response.json({ error: catalog.error }, { status: 503 });
  try {
    const quote = quoteCart((body as { items: CartItem[] }).items, catalog.products);
    return Response.json({ ...quote, source: catalog.source, deliveryFeeCents: null, paymentAvailable: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Carrinho inválido." }, { status: 400 });
  }
}
