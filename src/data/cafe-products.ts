export type CafeProduct = {
  id: string;
  name: string;
  category: "grain" | "chaud" | "froid" | "patisserie";
  description: string;
  priceUsd: number;
  priceCdf: number;
  badge?: string;
};

export const cafeCategories = [
  { id: "all", label: "Tout" },
  { id: "grain", label: "Grain / moulu" },
  { id: "chaud", label: "Chaud" },
  { id: "froid", label: "Froid" },
  { id: "patisserie", label: "Pâtisseries" },
] as const;

export const cafeProducts: CafeProduct[] = [
  {
    id: "kivu-grain",
    name: "Kivu Grain Premium",
    category: "grain",
    description: "Notes chocolatées, torréfaction moyenne — 250g",
    priceUsd: 8,
    priceCdf: 22400,
    badge: "Best-seller",
  },
  {
    id: "ituri-moulu",
    name: "Ituri Moulu",
    category: "grain",
    description: "Corsé et fruité, idéal filtre — 250g",
    priceUsd: 7,
    priceCdf: 19600,
  },
  {
    id: "espresso-gombe",
    name: "Espresso Gombe",
    category: "chaud",
    description: "Shot serré, crema dense",
    priceUsd: 2.5,
    priceCdf: 7000,
  },
  {
    id: "latte-vanille",
    name: "Latte Vanille",
    category: "chaud",
    description: "Lait onctueux + espresso local",
    priceUsd: 4,
    priceCdf: 11200,
  },
  {
    id: "cold-brew",
    name: "Cold Brew Kivu",
    category: "froid",
    description: "Infusion 12h, servi glacé",
    priceUsd: 4.5,
    priceCdf: 12600,
    badge: "Nouveau",
  },
  {
    id: "iced-caramel",
    name: "Iced Caramel",
    category: "froid",
    description: "Espresso, lait, caramel",
    priceUsd: 4.5,
    priceCdf: 12600,
  },
  {
    id: "croissant",
    name: "Croissant beurre",
    category: "patisserie",
    description: "Pur beurre, croustillant",
    priceUsd: 2,
    priceCdf: 5600,
  },
  {
    id: "brownie",
    name: "Brownie cacao",
    category: "patisserie",
    description: "Cacao RDC, cœur fondant",
    priceUsd: 2.5,
    priceCdf: 7000,
  },
];

export const WHATSAPP_NUMBER = "243810000000";
