import type { Metadata } from "next";
import { Inter, Geist, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

// Gövde: Inter (400/500). UI metni, açıklamalar, etiketler. (Eden: bold yok.)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Display: Geist (geometrik sans) — başlıklar + hero stat sayıları. (Eden primary.)
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

// Mono: IBM Plex Mono — kod / teknik string. (Eden monospace.)
const ibmMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CemOS",
  description: "Kişisel üretim motoru — içerik, haber ve sistem otomasyonu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${inter.variable} ${geist.variable} ${ibmMono.variable} h-full`}>
      <body className="min-h-full" style={{ background: "var(--bg-base)" }}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
