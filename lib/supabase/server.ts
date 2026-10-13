import { createClient } from "@supabase/supabase-js";

export function createSupabaseServiceClient() {
  if (typeof window !== "undefined") throw new Error("Operação exclusiva do servidor.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Servidor de checkout não configurado.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
