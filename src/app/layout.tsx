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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://www.okapi.cd",
  ),
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
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
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
