/** Types & helpers for Okapi project cloud save (multi-file Studio). */

export type OkapiArtifacts = {
  react?: string | null;
  reactNative?: string | null;
  nextjs?: string | null;
  sql?: string | null;
  api?: string | null;
  python?: string | null;
  flutter?: string | null;
  readme?: string | null;
  images?: { url: string; prompt?: string; createdAt?: string }[];
};

const ARTIFACT_KEYS = [
  "react",
  "reactNative",
  "nextjs",
  "sql",
  "api",
  "python",
  "flutter",
  "readme",
] as const;

type ArtifactTextKey = (typeof ARTIFACT_KEYS)[number];

export function emptyArtifacts(): OkapiArtifacts {
  return {};
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function parseImages(input: unknown) {
  if (!Array.isArray(input)) return undefined;
  return input
    .filter(
      (x): x is { url: string; prompt?: string; createdAt?: string } =>
        Boolean(
          x &&
            typeof x === "object" &&
            typeof (x as { url?: string }).url === "string",
        ),
    )
    .slice(0, 40);
}

export function normalizeArtifacts(input: unknown): OkapiArtifacts {
  if (!input || typeof input !== "object") return {};
  const a = input as Record<string, unknown>;
  const images = parseImages(a.images);

  return {
    react: asNonEmptyString(a.react),
    reactNative: asNonEmptyString(a.reactNative),
    nextjs: asNonEmptyString(a.nextjs),
    sql: asNonEmptyString(a.sql),
    api: asNonEmptyString(a.api),
    python: asNonEmptyString(a.python),
    flutter: asNonEmptyString(a.flutter),
    readme: asNonEmptyString(a.readme),
    images,
  };
}

/**
 * Partial patch: only keys actually present on the input object.
 * Use this before mergeArtifacts so missing keys are not treated as clears.
 */
export function pickArtifactPatch(input: unknown): Partial<OkapiArtifacts> {
  if (!input || typeof input !== "object") return {};
  const a = input as Record<string, unknown>;
  const out: Partial<OkapiArtifacts> = {};

  for (const key of ARTIFACT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(a, key)) continue;
    const raw = a[key];
    if (raw === null || raw === undefined) {
      out[key] = null;
    } else if (typeof raw === "string") {
      out[key] = raw.trim() ? raw : null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(a, "images")) {
    const images = parseImages(a.images);
    out.images = images?.length ? images : undefined;
  }

  return out;
}

/**
 * Merge patch onto base. Only keys present on `patch` are applied
 * (so a partial save never wipes unrelated Studio files).
 * Explicit `null` clears a field.
 */
export function mergeArtifacts(
  base: OkapiArtifacts | null | undefined,
  patch: Partial<OkapiArtifacts> | null | undefined,
): OkapiArtifacts {
  const b = normalizeArtifacts(base ?? {});
  const p = pickArtifactPatch(patch ?? {});
  if (!Object.keys(p).length) return b;

  const next: OkapiArtifacts = { ...b };

  for (const key of ARTIFACT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(p, key)) continue;
    next[key] = p[key] ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(p, "images")) {
    next.images = p.images?.length ? p.images : undefined;
  }

  return normalizeArtifacts(next);
}

/** Build artifacts blob from live Studio / preview snap (html excluded — column). */
export function artifactsFromSnap(snap: {
  react?: string | null;
  reactNative?: string | null;
  nextjs?: string | null;
  sql?: string | null;
  api?: string | null;
  python?: string | null;
  flutter?: string | null;
  readme?: string | null;
  images?: OkapiArtifacts["images"];
}): OkapiArtifacts {
  return normalizeArtifacts({
    react: snap.react,
    reactNative: snap.reactNative,
    nextjs: snap.nextjs,
    sql: snap.sql,
    api: snap.api,
    python: snap.python,
    flutter: snap.flutter,
    readme: snap.readme,
    images: snap.images,
  });
}

/** Prefer incoming non-empty text; otherwise keep previous (safe generate updates). */
export function keepOrReplace(
  incoming: string | null | undefined,
  previous: string | null | undefined,
): string | null {
  if (typeof incoming === "string" && incoming.trim()) return incoming;
  if (typeof previous === "string" && previous.trim()) return previous;
  return null;
}

export function countFilledArtifacts(
  artifacts: OkapiArtifacts | null | undefined,
  html?: string | null,
): number {
  const a = normalizeArtifacts(artifacts ?? {});
  let n = html && html.trim() ? 1 : 0;
  for (const key of ARTIFACT_KEYS) {
    if (a[key]) n += 1;
  }
  return n;
}

export function listFilledArtifactLabels(
  artifacts: OkapiArtifacts | null | undefined,
  html?: string | null,
): string[] {
  const a = normalizeArtifacts(artifacts ?? {});
  const labels: string[] = [];
  if (html?.trim()) labels.push("HTML");
  if (a.react) labels.push("React");
  if (a.reactNative) labels.push("React Native");
  if (a.nextjs) labels.push("Next.js");
  if (a.sql) labels.push("SQL");
  if (a.api) labels.push("API");
  if (a.python) labels.push("Python");
  if (a.flutter) labels.push("Flutter");
  if (a.readme) labels.push("README");
  return labels;
}

/** Ensure a short README exists so Studio / ZIP always have a doc file. */
export function ensureReadmeArtifact(
  artifacts: OkapiArtifacts,
  opts: { title: string; hasHtml: boolean },
): OkapiArtifacts {
  if (artifacts.readme?.trim()) return artifacts;
  const lines = [
    `# ${opts.title}`,
    "",
    "Projet généré avec Okapi (MMC SARL).",
    "",
    opts.hasHtml
      ? "- Ouvre `app.html` en Preview, ou le Studio pour éditer tous les fichiers."
      : "- Ouvre le Studio Okapi pour compléter les fichiers.",
    "- Schéma SQL / API : onglets Code ou Studio si présents.",
    "",
  ];
  return { ...artifacts, readme: lines.join("\n") };
}

export function hasAnyArtifactText(a: OkapiArtifacts | null | undefined): boolean {
  const n = normalizeArtifacts(a ?? {});
  return ARTIFACT_KEYS.some((k) => Boolean(n[k]));
}

export type { ArtifactTextKey };

/** Columns returned by projects API (list + detail). */
export const PROJECT_SELECT =
  "id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug, artifacts, backend_sql, backend_api, backend_readme";
