export const storeConfig = {
  platform: "L7 Commerce",
  name: "Borbogata",
  logoLetter: "B",
  domain: "borbogata.com.br",
  support: "(71) 99999-9999",
  instagram: "@borbogata_modas",
  colors: {
    primary: "#6e1834",
    primaryDark: "#481022",
    accent: "#bd9261",
  },
  shippingOrigin: "Salvador, BA",
  installments: 3,
  organizationSlug: process.env.NEXT_PUBLIC_STORE_SLUG || "borbogata",
  demoMode: !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} as const;
