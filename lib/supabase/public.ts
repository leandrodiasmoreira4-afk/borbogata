import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";

export function createSupabasePublicClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
