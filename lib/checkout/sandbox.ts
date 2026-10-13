import { paymentConfig } from "../payments/config.ts";

export function sandboxCheckoutConfig(env: Record<string, string | undefined>) {
  const payment = paymentConfig(env);
  const ref = env.CHECKOUT_SANDBOX_PROJECT_REF;
  if (!ref || !/^[a-z]{20}$/.test(ref) || ref === "lgdllillwtjsmzxjwrrr" ||
      env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co` || !env.SUPABASE_SECRET_KEY) {
    throw new Error("Configure um banco separado para homologação.");
  }
  const url = new URL(env.STORE_PUBLIC_URL || "");
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Configure a URL HTTPS de homologação.");
  return { payment, siteUrl: url.origin };
}
