import type { Metadata } from "next";
import { CafeShop } from "@/components/cafe/cafe-shop";

export const metadata: Metadata = {
  title: "Café Gombe — Preview Okapi",
  description:
    "Boutique café mobile-first à Gombe : catalogue, panier, Mobile Money, WhatsApp.",
};

export default function CafeGombePreviewPage() {
  return <CafeShop />;
}
