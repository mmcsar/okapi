"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  OKAPI_PUBLIC_SANDBOX,
  stripOkapiRuntime,
} from "@/lib/okapi-runtime";

type PublicProject = {
  title: string;
  sector: string;
  html: string;
  summary: string | null;
};

export default function PublicProjectPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [project, setProject] = useState<PublicProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/public/${slug}`);
        const data = (await res.json()) as {
          project?: PublicProject;
          error?: string;
        };
        if (!res.ok || !data.project) {
          throw new Error(data.error ?? `Erreur ${res.status}`);
        }
        if (!cancelled) setProject(data.project);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Introuvable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const safeHtml = useMemo(
    () => stripOkapiRuntime(project?.html || ""),
    [project?.html],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#e8eee9] text-sm text-okapi-ink/50">
        Chargement du projet…
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#e8eee9] px-4 text-center">
        <p className="font-[family-name:var(--font-syne)] text-2xl font-bold text-okapi-ink">
          Lien indisponible
        </p>
        <p className="max-w-md text-sm text-okapi-ink/55">{error}</p>
        <Link
          href="/"
          className="rounded-2xl bg-okapi-forest px-5 py-2.5 text-sm font-semibold text-white"
        >
          Retour Okapi
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#e8eee9]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--okapi-stroke)] bg-white/80 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="truncate font-[family-name:var(--font-syne)] text-lg font-bold text-okapi-ink">
            {project.title}
          </p>
          <p className="text-[11px] text-okapi-ink/45">
            Partagé via Okapi · {project.sector}
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-2xl border border-[var(--okapi-stroke)] bg-white px-3 py-2 text-xs font-semibold text-okapi-ink/70"
        >
          Créer avec Okapi
        </Link>
      </header>
      <iframe
        title={project.title}
        srcDoc={safeHtml}
        sandbox={OKAPI_PUBLIC_SANDBOX}
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 bg-white"
      />
    </div>
  );
}
