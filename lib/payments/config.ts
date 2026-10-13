export type PaymentConfig = { mode: "sandbox"; accessToken: string; webhookSecret: string; collectorId: string };

/** Production remains deliberately unavailable until the sandbox acceptance gate is complete. */
export function paymentConfig(env: Record<string, string | undefined>): PaymentConfig {
  if (env.MERCADO_PAGO_MODE !== "sandbox") throw new Error("Pagamentos desativados. Configure o ambiente de testes.");
  const accessToken = env.MERCADO_PAGO_SANDBOX_ACCESS_TOKEN;
  const webhookSecret = env.MERCADO_PAGO_SANDBOX_WEBHOOK_SECRET;
  const collectorId = env.MERCADO_PAGO_SANDBOX_COLLECTOR_ID;
  if (!accessToken || !webhookSecret || !collectorId || !/^\d+$/.test(collectorId)) throw new Error("Ambiente de testes incompleto.");
  return { mode: "sandbox", accessToken, webhookSecret, collectorId };
}
