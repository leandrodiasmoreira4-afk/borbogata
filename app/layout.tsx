import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Borbogata | Ousada e sem limites",
  description: "Moda feminina em Salvador para mulheres ousadas, autênticas e antenadas nas tendências. Borbogata: você ousada e sem limites.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
