import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AuthBar } from "@/components/AuthBar";

export const metadata: Metadata = {
  title: "I.Ag — Inteligencia Agronómica",
  description: "Plataforma para ingenieros agrónomos y productores agropecuarios",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/iag-logo.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full flex flex-col">
        <Providers>
          <AuthBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
