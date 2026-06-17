import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

// Tek aile: Inter (tüm ağırlıklar). Display hiyerarşisi ağırlıkla; Sora kaldırıldı.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
    <html lang="tr" className={`${inter.variable} h-full`}>
      <body className="min-h-full" style={{ background: "var(--bg-base)" }}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
