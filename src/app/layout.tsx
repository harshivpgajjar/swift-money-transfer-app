import type { Metadata } from "next";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const metadata: Metadata = {
  title: "Swift Money Transfer",
  description: "Distributor ↔ FOS ↔ Retailer money flow",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getServerLocale();
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full">
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
