/** Server-only Checkout Pro adapter. Never import this module into a client component. */
export type PaymentItem = {
  variantId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type PreferenceInput = {
  orderId: string;
  payerEmail: string;
  items: PaymentItem[];
  shippingCents: number;
  siteUrl: string;
};

export function buildPreference(input: PreferenceInput) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.orderId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.payerEmail)) {
    throw new Error("Dados do pedido inválidos.");
  }
  if (!input.items.length || input.items.length > 50 || !Number.isSafeInteger(input.shippingCents) || input.shippingCents < 0) {
    throw new Error("Valores do pedido inválidos.");
  }
  const site = new URL(input.siteUrl);
  if (site.protocol !== "https:" || site.username || site.password) throw new Error("URL pública HTTPS obrigatória.");
  const items = input.items.map((item) => {
    if (!item.variantId || !item.name.trim() || !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
      !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 1) {
      throw new Error("Item do pedido inválido.");
    }
    return { id: item.variantId, title: item.name, quantity: item.quantity, currency_id: "BRL", unit_price: item.unitPriceCents / 100 };
  });
  const url = site.origin;
  return {
    items,
    payer: { email: input.payerEmail },
    external_reference: input.orderId,
    back_urls: {
      success: `${url}/checkout/retorno?status=success`,
      pending: `${url}/checkout/retorno?status=pending`,
      failure: `${url}/checkout/retorno?status=failure`,
    },
    notification_url: `${url}/api/payments/mercado-pago/webhook`,
    ...(input.shippingCents > 0 ? { shipments: { cost: input.shippingCents / 100, mode: "not_specified" } } : {}),
  };
}

export async function createPreference(input: PreferenceInput, accessToken: string, fetcher: typeof fetch = fetch) {
  if (!accessToken) throw new Error("Mercado Pago não configurado.");
  const response = await fetcher("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildPreference(input)),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Não foi possível iniciar o pagamento.");
  const result: unknown = await response.json();
  const destinationField = "sandbox_init_point";
  if (!result || typeof result !== "object" || !("id" in result) ||
      typeof result.id !== "string" || !(destinationField in result)) {
    throw new Error("Resposta de pagamento inválida.");
  }
  const destinationValue = (result as Record<string, unknown>)[destinationField];
  if (typeof destinationValue !== "string") throw new Error("Resposta de pagamento inválida.");
  const destination = new URL(destinationValue);
  if (destination.protocol !== "https:" || destination.username || destination.password || destination.port || !["sandbox.mercadopago.com", "sandbox.mercadopago.com.br"].includes(destination.hostname)) {
    throw new Error("Destino de pagamento inválido.");
  }
  return { preferenceId: result.id, paymentUrl: destination.toString() };
}
