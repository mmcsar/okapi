import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
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
  title: "Okapi — AI Agent RDC",
  description:
    "Okapi: multilingual AI agent that answers and builds sites & apps for DRC.",
  icons: {
    icon: "/okapi-logo.png",
    apple: "/okapi-logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${manrope.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="relative min-h-full font-sans text-okapi-ink">
        <div className="relative z-10 flex min-h-full flex-col">{children}</div>
      </body>
    </html>
  );
}
