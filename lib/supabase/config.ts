export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function getSupabaseServerConfig() {
  const publicConfig = getSupabasePublicConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!publicConfig || !secretKey) return null;
  return { ...publicConfig, secretKey };
}
