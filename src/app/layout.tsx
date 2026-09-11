import type { Metadata, Viewport } from "next";
import { Manrope, Syne } from "next/font/google";
import { Atmosphere3d } from "@/components/atmosphere-3d";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Okapi — Plateforme IA de MMC SARL",
  description:
    "Okapi est la plateforme IA de MMC SARL : agent multilingue qui répond et construit sites & apps pour la RDC.",
  applicationName: "Okapi",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Okapi",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/okapi-logo.png", type: "image/png" }],
    apple: [{ url: "/okapi-logo.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1b4f3a" },
    { media: "(prefers-color-scheme: dark)", color: "#1b4f3a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${manrope.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="relative min-h-full font-sans text-okapi-ink">
        <PwaRegister />
        <Atmosphere3d />
        <div className="relative z-10 flex min-h-full flex-col">{children}</div>
      </body>
    </html>
  );
}
