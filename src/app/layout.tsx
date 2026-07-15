import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

// Gövde + başlık: Plus Jakarta Sans (geometrik/yuvarlak modern sans — referans
// ADR-021 karakteri; Inter'in yerini alır). Variable font (200-800). latin-ext =
// Türkçe glyph'ler (İ ı Ş ş Ğ ğ Ç ç Ö ö Ü ü). Tek app-sans ailesi.
const appSans = Plus_Jakarta_Sans({
  variable: "--font-app-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Mono: IBM Plex Mono — kod / teknik string.
const ibmMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin", "latin-ext"],
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
    <html lang="tr" className={`${appSans.variable} ${ibmMono.variable} h-full`}>
      <body className="min-h-full" style={{ background: "var(--bg-base)" }}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
