/** Vrais agents métier Okapi — prompts branchés sur Studio / generate. */

export type OkapiAgentId =
  | "general"
  | "restaurant"
  | "boutique"
  | "clinique"
  | "ecole"
  | "crm"
  | "design";

export type OkapiAgentDef = {
  id: OkapiAgentId;
  label: string;
  sector: string;
  short: string;
  /** Injected into system prompts */
  systemAddon: string;
};

export const OKAPI_AGENTS: readonly OkapiAgentDef[] = [
  {
    id: "general",
    label: "Okapi",
    sector: "Général",
    short: "Polyvalent",
    systemAddon: `AGENT: Okapi généraliste MMC SARL.
- Produits clairs, mobile-first, RDC (WhatsApp / Mobile Money quand utile).
- Pas de jargon inutile. UI en français si l’utilisateur écrit en français.`,
  },
  {
    id: "restaurant",
    label: "Restaurant",
    sector: "Restaurant",
    short: "Menu & commandes",
    systemAddon: `AGENT MÉTIER: Restaurant (RDC).
Product rules:
- Menu avec catégories, prix CDF, photos plats (Pollinations).
- Commande / panier / table ou à emporter.
- WhatsApp pour confirmer la commande ; Mobile Money (Orange/Airtel/M-Pesa) au checkout.
- Écrans: Accueil · Menu · Panier · Suivi commande · Contact.
- SQL: dishes, categories, orders, order_items, tables (si salle).
- API: window.Okapi.list/create('dishes'|'orders') — données réelles Okapi.
- Ton: appétissant, rapide, mobile-first Kinshasa/Gombe.`,
  },
  {
    id: "boutique",
    label: "Boutique",
    sector: "Boutique",
    short: "Catalogue & stock",
    systemAddon: `AGENT MÉTIER: Boutique / e-commerce léger (RDC).
Product rules:
- Catalogue produits, stock, prix CDF, variantes simples.
- Panier + checkout Mobile Money + bouton WhatsApp vendeur.
- Écrans: Accueil · Catalogue · Fiche produit · Panier · Commandes.
- SQL: products, categories, stock_movements, customers, orders, order_items.
- API: window.Okapi.list/create('products'|'orders') — vraies données cloud Okapi.
- UX: confiance, clarté prix, pas de checkout carte bancaire obligatoire.`,
  },
  {
    id: "clinique",
    label: "Clinique",
    sector: "Clinique",
    short: "Patients & RDV",
    systemAddon: `AGENT MÉTIER: Clinique / cabinet (RDC).
Product rules:
- Patients, rendez-vous, file d’attente, contacts WhatsApp.
- Respect vie privée — pas de données médicales sensibles inventées.
- Écrans: Accueil · Patients · RDV · Agenda · Contact.
- SQL: patients, appointments, staff (léger), RLS-friendly.
- API: window.Okapi.list/create('patients'|'appointments') — persistance réelle.
- UX: calme, lisible, mobile pour réceptionnistes.`,
  },
  {
    id: "ecole",
    label: "École",
    sector: "École",
    short: "Inscriptions & notes",
    systemAddon: `AGENT MÉTIER: École / université (RDC).
Product rules:
- Inscriptions, classes, notes, emploi du temps simple.
- Paiement frais scolaires via Mobile Money + reçu.
- Écrans: Accueil · Inscription · Classes · Notes · Paiements.
- SQL: students, classes, enrollments, grades, payments.
- API: enroll, grades stubs, payment intent stub.
- UX: claire pour parents / admin école.`,
  },
  {
    id: "crm",
    label: "CRM",
    sector: "CRM",
    short: "Clients & ventes",
    systemAddon: `AGENT MÉTIER: CRM / gestion clients (PME RDC).
Product rules:
- Clients, leads, pipeline, relances WhatsApp.
- Écrans: Dashboard · Clients · Pipeline · Tâches · Stats simples.
- SQL: clients, deals, activities, users.
- API: clients CRUD, deal stage update.
- UX: tableau de bord utile, pas de vanity metrics.`,
  },
  {
    id: "design",
    label: "Design",
    sector: "Design",
    short: "UI & style",
    systemAddon: `AGENT MÉTIER: Design Okapi.
Product rules:
- Typo expressive (pas Inter/Roboto/Arial), contraste fort, mobile-first.
- Éviter purple-on-white générique et dark-glow cliché.
- Une composition claire, peu de cards inutiles, CTA évident.
- Cohérence couleurs / spacing avec la marque du brief.`,
  },
] as const;

const BY_ID = Object.fromEntries(
  OKAPI_AGENTS.map((a) => [a.id, a]),
) as Record<OkapiAgentId, OkapiAgentDef>;

export function getOkapiAgent(id: string | null | undefined): OkapiAgentDef {
  if (id && id in BY_ID) return BY_ID[id as OkapiAgentId];
  return BY_ID.general;
}

/** Resolve agent from explicit id, sector label, or free-text brief. */
export function resolveOkapiAgent(opts: {
  agentId?: string | null;
  sector?: string | null;
  instruction?: string | null;
}): OkapiAgentDef {
  if (opts.agentId) {
    const direct = getOkapiAgent(opts.agentId);
    if (opts.agentId !== "general" || !opts.instruction) return direct;
  }

  const blob = `${opts.sector || ""} ${opts.instruction || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  if (
    /\b(restaurant|menu|plat|commande|table|traiteur|bar|cafe|café)\b/.test(
      blob,
    )
  ) {
    return BY_ID.restaurant;
  }
  if (
    /\b(boutique|shop|ecommerce|e-commerce|catalogue|panier|stock|magasin|vente en ligne)\b/.test(
      blob,
    )
  ) {
    return BY_ID.boutique;
  }
  if (
    /\b(clinique|hopital|hôpital|patient|medecin|médecin|cabinet|sante|santé|rdv medical)\b/.test(
      blob,
    )
  ) {
    return BY_ID.clinique;
  }
  if (
    /\b(ecole|école|universite|université|eleve|élève|inscription|notes|classe)\b/.test(
      blob,
    )
  ) {
    return BY_ID.ecole;
  }
  if (
    /\b(crm|client|pipeline|lead|prospect|relance|commercial)\b/.test(blob)
  ) {
    return BY_ID.crm;
  }
  if (/\b(design|ui|ux|style|couleur|typo|marque|branding)\b/.test(blob)) {
    return BY_ID.design;
  }

  const sector = (opts.sector || "").toLowerCase();
  for (const agent of OKAPI_AGENTS) {
    if (agent.id === "general") continue;
    if (sector.includes(agent.sector.toLowerCase())) return agent;
  }

  return BY_ID.general;
}

export function agentSystemBlock(agent: OkapiAgentDef): string {
  return `\n\n———\n${agent.systemAddon}\n———\n`;
}
