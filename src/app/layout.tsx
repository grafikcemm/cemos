import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Premium başlık (display) fontu — yalnızca başlıklarda kullanılır; gövde Inter.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
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
    <html lang="tr" className={`${inter.variable} ${sora.variable} h-full`}>
      <body className="min-h-full" style={{ background: "var(--bg-base)" }}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
