import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

// Gövde + display: Inter. UI metni, başlıklar, hero stat sayıları.
// Soft premium: başlıklar 600 (globals .font-display), gövde 400/500.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Mono: IBM Plex Mono — kod / teknik string.
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
    <html lang="tr" className={`${inter.variable} ${ibmMono.variable} h-full`}>
      <body className="min-h-full" style={{ background: "var(--bg-base)" }}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
