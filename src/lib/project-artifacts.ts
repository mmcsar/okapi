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

export function emptyArtifacts(): OkapiArtifacts {
  return {};
}

export function normalizeArtifacts(
  input: unknown,
): OkapiArtifacts {
  if (!input || typeof input !== "object") return {};
  const a = input as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v : null;
  const images = Array.isArray(a.images)
    ? a.images
        .filter(
          (x): x is { url: string; prompt?: string; createdAt?: string } =>
            Boolean(x && typeof x === "object" && typeof (x as { url?: string }).url === "string"),
        )
        .slice(0, 40)
    : undefined;

  return {
    react: str(a.react),
    reactNative: str(a.reactNative),
    nextjs: str(a.nextjs),
    sql: str(a.sql),
    api: str(a.api),
    python: str(a.python),
    flutter: str(a.flutter),
    readme: str(a.readme),
    images,
  };
}

export function mergeArtifacts(
  base: OkapiArtifacts | null | undefined,
  patch: Partial<OkapiArtifacts>,
): OkapiArtifacts {
  const b = normalizeArtifacts(base ?? {});
  const p = normalizeArtifacts(patch);
  return {
    react: p.react ?? b.react,
    reactNative: p.reactNative ?? b.reactNative,
    nextjs: p.nextjs ?? b.nextjs,
    sql: p.sql ?? b.sql,
    api: p.api ?? b.api,
    python: p.python ?? b.python,
    flutter: p.flutter ?? b.flutter,
    readme: p.readme ?? b.readme,
    images: p.images?.length ? p.images : b.images,
  };
}

/** Columns returned by projects API (list + detail). */
export const PROJECT_SELECT =
  "id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug, artifacts, backend_sql, backend_api, backend_readme";
