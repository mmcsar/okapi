"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { OkapiProject } from "@/lib/supabase";

type ProjectsPanelProps = {
  onBack?: () => void;
  onOpenProject: (project: OkapiProject) => void;
  onCreateNew: () => void;
  onNeedLogin: () => void;
};

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ProjectsPanel({
  onBack,
  onOpenProject,
  onCreateNew,
  onNeedLogin,
}: ProjectsPanelProps) {
  const { user, ready, authFetch } = useAuth();
  const [projects, setProjects] = useState<OkapiProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/projects");
      const raw = await res.text();
      let data: {
        projects?: OkapiProject[];
        error?: string;
        setupRequired?: boolean;
      } = {};
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        throw new Error(
          res.status === 404
            ? "API projets indisponible. Redémarre le serveur Okapi (npm run dev)."
            : "Réponse invalide du serveur. Recharge la page.",
        );
      }
      if (!res.ok) {
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      setProjects(data.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [authFetch, user]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setProjects([]);
      return;
    }
    void load();
  }, [ready, user, load]);

  async function remove(id: string) {
    if (!confirm("Supprimer ce projet ?")) return;
    const res = await authFetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Suppression impossible");
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--okapi-stroke)] px-4 py-4 lg:px-8">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
            Projets
          </h1>
          <p className="mt-1 text-sm text-okapi-ink/50">
            Clique un projet → ouverture directe dans Okapi Studio (code)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCreateNew}
            className="rounded-2xl bg-okapi-amber px-4 py-2 text-sm font-semibold text-white"
          >
            + Nouveau
          </button>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/70 px-4 py-2 text-sm"
            >
              Retour
            </button>
          ) : null}
        </div>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {!user ? (
            <div className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-6 text-center">
              <p className="text-sm text-okapi-ink/60">
                Connecte-toi pour voir et rouvrir tes projets cloud.
              </p>
              <button
                type="button"
                onClick={onNeedLogin}
                className="mt-4 rounded-2xl bg-okapi-forest px-4 py-2.5 text-sm font-semibold text-white"
              >
                Se connecter
              </button>
            </div>
          ) : null}

          {user && loading ? (
            <p className="text-sm text-okapi-ink/45">Chargement…</p>
          ) : null}

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {user && !loading && !error && projects.length === 0 ? (
            <div className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-6 text-center">
              <p className="text-sm text-okapi-ink/60">Aucun projet encore.</p>
              <p className="mt-2 text-xs text-okapi-ink/40">
                Tu peux générer dans Studio sans compte. Pour que le projet
                apparaisse ici : Connexion → Accepte →{" "}
                <strong>Sauver</strong> (Ctrl+S).
              </p>
              <button
                type="button"
                onClick={onCreateNew}
                className="mt-4 rounded-2xl bg-okapi-forest px-4 py-2.5 text-sm font-semibold text-white"
              >
                Créer mon premier projet
              </button>
            </div>
          ) : null}

          {projects.map((project) => (
            <article
              key={project.id}
              className="flex items-center justify-between gap-4 rounded-3xl border border-[var(--okapi-stroke)] bg-white/70 px-5 py-4 transition hover:border-okapi-forest/25 hover:bg-white"
            >
              <button
                type="button"
                onClick={() => onOpenProject(project)}
                className="min-w-0 flex-1 text-left"
                title="Ouvrir dans Okapi Studio"
              >
                <h2 className="truncate text-sm font-semibold text-okapi-ink">
                  {project.title}
                </h2>
                <p className="mt-1 text-xs text-okapi-ink/45">
                  {project.sector} · {formatWhen(project.updated_at)}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-okapi-forest/70">
                  Studio Dev · code
                </p>
              </button>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => onOpenProject(project)}
                  className="rounded-full bg-[#0f1a14] px-3 py-1.5 text-[11px] font-semibold text-white"
                  title="Ouvrir dans Okapi Studio"
                >
                  Studio
                </button>
                <button
                  type="button"
                  onClick={() => void remove(project.id)}
                  className="rounded-full bg-okapi-mist px-3 py-1 text-[11px] font-medium text-okapi-ink/50"
                >
                  Suppr.
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
