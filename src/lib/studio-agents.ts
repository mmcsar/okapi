/** Vrais agents métier Okapi — prompts branchés sur Studio / generate. */

import {
  OKAPI_MOBILE_MONEY_UX,
  OKAPI_VITRINE_DESIGN,
} from "@/lib/generate-quality";

export type OkapiAgentId =
  | "general"
  | "restaurant"
  | "boutique"
  | "pharmacie"
  | "flotte"
  | "paroisse"
  | "clinique"
  | "ecole"
  | "crm"
  | "design"
  | "vitrine";

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
- Produits clairs, mobile-first, RDC.
- ${OKAPI_MOBILE_MONEY_UX}
- Pas de jargon inutile. UI en français si l’utilisateur écrit en français.`,
  },
  {
    id: "restaurant",
    label: "Restaurant",
    sector: "Restaurant",
    short: "Menu & commandes",
    systemAddon: `AGENT MÉTIER: Restaurant (RDC).
Product rules:
- Menu avec catégories, prix CDF, photos plats (picsum.photos).
- Commande / panier / table ou à emporter.
- ${OKAPI_MOBILE_MONEY_UX}
- Écrans: Accueil · Menu · Panier · Paiement · Suivi commande · Contact.
- SQL: dishes, categories, orders, order_items, tables (si salle).
- API: window.Okapi.list/create('dishes'|'orders') — lignes plates {id,...} (jamais .data).
- Ton: appétissant, rapide, mobile-first Kinshasa/Gombe.`,
  },
  {
    id: "pharmacie",
    label: "Pharmacie",
    sector: "Pharmacie",
    short: "Stock & caisse",
    systemAddon: `AGENT MÉTIER: Pharmacie de quartier (RDC).
Product rules:
- Stock médicaments, recherche, prix CDF, garde de nuit, vente comptoir.
- Ne donne aucun conseil médical et n’invente pas d’ordonnance. C’est une caisse + stock, pas un diagnostic.
- ${OKAPI_MOBILE_MONEY_UX}
- Écrans: Accueil · Stock · Vente · Garde · Reçu.
- SQL: medicines, stock_movements, sales, sale_items.
- API: window.Okapi.list/create('medicines'|'sales') — lignes plates {id, name, price…}.
- UX: lisible pour un comptoir, gros boutons, mobile-first Kinshasa.`,
  },
  {
    id: "flotte",
    label: "Flotte",
    sector: "Flotte",
    short: "Courses moto",
    systemAddon: `AGENT MÉTIER: Courses moto / flotte (Kinshasa).
Product rules:
- Demande de course entre communes réelles (Gombe, Lingwala, Kintambo, Ngaliema, Lemba, Masina…).
- Tarif en CDF, conducteur, suivi simple (demandée → en route → arrivée).
- ${OKAPI_MOBILE_MONEY_UX}
- Écrans: Accueil · Nouvelle course · Suivi · Historique · Paiement.
- SQL: rides, riders, zones, payments.
- API: window.Okapi.list/create('rides') — lignes plates {id, from, to, fare…}.
- UX: une main, gros CTA, pas une carte GPS fictive qui prétend être live.`,
  },
  {
    id: "paroisse",
    label: "Paroisse",
    sector: "Paroisse",
    short: "Messes & offrandes",
    systemAddon: `AGENT MÉTIER: Paroisse / communauté (RDC).
Product rules:
- Horaires des messes, annonces, offrandes et dîme en CDF.
- Ton respectueux. Pas de promesse spirituelle, pas de faux reçu « miracle ».
- ${OKAPI_MOBILE_MONEY_UX}
- Écrans: Accueil · Messes · Annonces · Offrande · Reçu.
- SQL: masses, announcements, offerings.
- API: window.Okapi.list/create('offerings'|'announcements') — lignes plates {id,…}.
- UX: calme, lisible pour un téléphone partagé en famille.`,
  },
  {
    id: "boutique",
    label: "Boutique",
    sector: "Boutique",
    short: "Catalogue & stock",
    systemAddon: `AGENT MÉTIER: Boutique / e-commerce léger (RDC).
Product rules:
- Catalogue produits, stock, prix CDF, variantes simples.
- Panier + checkout Mobile Money (pas WhatsApp sauf demande explicite).
- ${OKAPI_MOBILE_MONEY_UX}
- Écrans: Accueil · Catalogue · Fiche produit · Panier · Paiement · Commandes.
- SQL: products, categories, stock_movements, customers, orders, order_items.
- API: window.Okapi.list/create('products'|'orders') — lignes plates {id, name, price…}.
- UX: confiance, clarté prix, pas de checkout carte bancaire obligatoire.`,
  },
  {
    id: "clinique",
    label: "Clinique",
    sector: "Clinique",
    short: "Patients & RDV",
    systemAddon: `AGENT MÉTIER: Clinique / cabinet (RDC).
Product rules:
- Patients, rendez-vous, file d’attente, contacts.
- Respect vie privée — pas de données médicales sensibles inventées.
- Écrans: Accueil · Patients · RDV · Agenda · Contact.
- SQL: patients, appointments, staff (léger), RLS-friendly.
- API: window.Okapi.list/create('patients'|'appointments') — lignes plates {id,…}.
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
- ${OKAPI_MOBILE_MONEY_UX}
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
- Clients, leads, pipeline, tâches de relance.
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
  {
    id: "vitrine",
    label: "Vitrine",
    sector: "Vitrine",
    short: "Site & landing",
    systemAddon: `AGENT MÉTIER: Site vitrine / landing (RDC).
Product rules:
- ${OKAPI_VITRINE_DESIGN}
- Écrans: une page scroll (Accueil · Offre · Galerie · Contact) via ancres nav.
- SQL léger optionnel: leads / messages contact.
- API: window.Okapi.create('leads') pour le formulaire contact si présent.
- Pas de panier / stock sauf si le brief le demande explicitement.`,
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
    /\b(vitrine|landing|portfolio|showcase|site (web )?presentation|one[- ]?page|page vitrine)\b/.test(
      blob,
    )
  ) {
    return BY_ID.vitrine;
  }
  if (
    /\b(pharmacie|medicament|ordonnance|garde de nuit|comptoir)\b/.test(blob)
  ) {
    return BY_ID.pharmacie;
  }
  if (
    /\b(flotte|moto[- ]?taxi|course moto|courses moto|wewa|livraison moto)\b/.test(
      blob,
    )
  ) {
    return BY_ID.flotte;
  }
  if (
    /\b(paroisse|messe|messes|offrande|dime|eglise|chapelle)\b/.test(blob)
  ) {
    return BY_ID.paroisse;
  }
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
