import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Borbogata | Moda feminina",
  description: "Moda feminina com peças selecionadas para todos os momentos. Compre online com envio para todo o Brasil.",
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
