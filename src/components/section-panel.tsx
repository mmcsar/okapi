"use client";

type SectionPanelProps = {
  section: string;
  onBack?: () => void;
  onNavigate?: (id: string) => void;
};

const copy: Record<
  string,
  {
    title: string;
    subtitle: string;
    items?: { title: string; meta: string }[];
    actions?: { id: string; label: string }[];
  }
> = {
  projects: {
    title: "Projets",
    subtitle: "Tous tes sites et mini-apps Okapi",
    items: [
      { title: "Boutique café Gombe", meta: "Site · Aujourd’hui" },
      { title: "Menu restaurant Lingwala", meta: "App · Aujourd’hui" },
      { title: "Landing école Kinshasa", meta: "Site · Aujourd’hui" },
      { title: "Formulaire inscription univ", meta: "App · Hier" },
      { title: "Suivi stock mining light", meta: "App · Hier" },
    ],
    actions: [{ id: "dashboard", label: "Nouveau projet" }],
  },
  artifacts: {
    title: "Artifacts",
    subtitle: "Aperçus, exports et livrables générés",
    items: [
      { title: "Preview — Boutique café", meta: "HTML · prêt" },
      { title: "Export ZIP — Menu resto", meta: "Code · prêt" },
      { title: "Wireframe — Univ portal", meta: "UI · brouillon" },
    ],
  },
  planning: {
    title: "Planifié",
    subtitle: "Tâches et générations planifiées",
    items: [
      { title: "Générer landing association", meta: "Demain 09:00" },
      { title: "Rafraîchir menu restaurant", meta: "Vendredi 14:00" },
    ],
    actions: [{ id: "customize", label: "Personnaliser le planning" }],
  },
  news: {
    title: "Actualités",
    subtitle: "Nouveautés Okapi pour la RDC",
    items: [
      { title: "Templates Mining & Université", meta: "Nouveau" },
      { title: "Support Lingala / Swahili (bientôt)", meta: "Roadmap" },
      { title: "Connecteur Mobile Money", meta: "À venir" },
    ],
    actions: [{ id: "learn", label: "En savoir plus" }],
  },
  help: {
    title: "Obtenir de l’aide",
    subtitle: "Guides, FAQ et contact support",
    items: [
      { title: "Comment écrire un bon prompt", meta: "Guide" },
      { title: "Choisir un template RDC", meta: "Guide" },
      {
        title: "Okapi peut se tromper — pas un médecin ni un juriste",
        meta: "Avertissement",
      },
      { title: "Contacter le support Okapi", meta: "WhatsApp / email" },
    ],
    actions: [{ id: "learn", label: "Documentation" }],
  },
  learn: {
    title: "En savoir plus",
    subtitle: "Documentation produit et tutoriels",
    items: [
      { title: "Qu’est-ce qu’Okapi ?", meta: "Intro" },
      { title: "Architecture prompt → preview", meta: "Doc" },
      { title: "Brancher une API LLM", meta: "Doc" },
    ],
  },
  upgrade: {
    title: "Passer au plan Pro",
    subtitle: "Plus de projets, agents et exports",
    items: [
      { title: "Gratuit", meta: "3 projets · historique limité" },
      { title: "Pro", meta: "Illimité · artifacts · planning" },
      { title: "Business RDC", meta: "Équipes · templates métier" },
    ],
  },
  apps: {
    title: "Apps & extensions",
    subtitle: "Connecteurs à brancher plus tard",
    items: [
      { title: "HeyGen", meta: "Vidéo avatar" },
      { title: "Mobile Money", meta: "Paiements" },
      { title: "WhatsApp", meta: "Notifications" },
      { title: "Supabase", meta: "Auth & data" },
    ],
  },
  language: {
    title: "Langue",
    subtitle: "Langue de l’interface Okapi",
    items: [
      { title: "Français", meta: "Actif" },
      { title: "Lingala", meta: "Bientôt" },
      { title: "Swahili", meta: "Bientôt" },
      { title: "English", meta: "Bientôt" },
    ],
    actions: [{ id: "settings", label: "Ouvrir Paramètres" }],
  },
  customize: {
    title: "Personnaliser",
    subtitle: "Apparence, secteurs favoris et UX",
    items: [
      { title: "Thème forêt / ambre", meta: "Actif" },
      { title: "Secteurs favoris", meta: "Restaurant, Boutique…" },
      { title: "Densité de l’interface", meta: "Confort" },
    ],
    actions: [{ id: "settings", label: "Paramètres complets" }],
  },
  login: {
    title: "Connexion",
    subtitle: "Connecte-toi pour sauver tes projets",
    items: [
      { title: "Email + mot de passe", meta: "Bientôt" },
      { title: "Google", meta: "Bientôt" },
      { title: "Continuer en invité", meta: "Disponible" },
    ],
    actions: [
      { id: "auth-login", label: "Se connecter" },
      { id: "dashboard", label: "Continuer en invité" },
    ],
  },
};

export function SectionPanel({ section, onBack, onNavigate }: SectionPanelProps) {
  const data = copy[section] ?? {
    title: "Section",
    subtitle: "Contenu à venir",
    items: [],
  };

  return (
    <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--okapi-stroke)] px-4 py-4 lg:px-8">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
            {data.title}
          </h1>
          <p className="mt-1 text-sm text-okapi-ink/50">{data.subtitle}</p>
        </div>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/70 px-4 py-2 text-sm font-medium text-okapi-ink/70"
          >
            Retour
          </button>
        ) : null}
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {(data.items ?? []).map((item) => (
            <article
              key={item.title}
              className="flex items-center justify-between gap-4 rounded-3xl border border-[var(--okapi-stroke)] bg-white/70 px-5 py-4"
            >
              <div className="text-left">
                <h2 className="text-sm font-semibold text-okapi-ink">{item.title}</h2>
                <p className="mt-1 text-xs text-okapi-ink/45">{item.meta}</p>
              </div>
              <span className="rounded-full bg-okapi-mist px-3 py-1 text-[11px] font-medium text-okapi-ink/50">
                Voir
              </span>
            </article>
          ))}

          {data.actions?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => onNavigate?.(action.id)}
                  className="rounded-2xl bg-okapi-forest px-4 py-2.5 text-sm font-semibold text-white"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
