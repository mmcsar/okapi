/** Single source of truth for Okapi Studio files (UI, ZIP, cloud, APIs). */

/** Stacks Studio can ship as full projects (Preview / ZIP). */
export const OKAPI_STUDIO_STACK =
  "HTML · React · Next · Flutter · Python · SQL";

/**
 * Honesty line for Agent / Studio when the user asks Java, C#, Go, PHP, etc.
 * Explain + short excerpt OK — never promise a full Studio project or Preview.
 */
export const OKAPI_STUDIO_STACK_HONESTY = `Okapi livre des projets Studio en ${OKAPI_STUDIO_STACK}. Pour Java, C#, Go, PHP, Ruby, Rust, Kotlin (hors Flutter), Swift, etc. : expliquer ou donner un extrait court — pas un projet Studio complet ni une Preview. Proposer plutôt un équivalent HTML/React/Next/Flutter/Python si l’utilisateur veut une app dans Okapi.`;

export type StudioFileId =
  | "app.html"
  | "App.tsx"
  | "App.native.tsx"
  | "app/page.tsx"
  | "package.json"
  | "schema.sql"
  | "api.ts"
  | "main.py"
  | "requirements.txt"
  | "main.dart"
  | "pubspec.yaml"
  | "README.md";

export type StudioArtifactKey =
  | "html"
  | "react"
  | "reactNative"
  | "nextjs"
  | "packageJson"
  | "sql"
  | "api"
  | "python"
  | "requirements"
  | "flutter"
  | "pubspec"
  | "readme";

export type StudioFileGroup = "web" | "mobile" | "data" | "docs";

export type StudioFileDef = {
  id: StudioFileId;
  artifactKey: StudioArtifactKey;
  label: string;
  language: string;
  badge: string;
  group: StudioFileGroup;
  zipPath: string;
  emptyHint: string;
};

export const STUDIO_GROUP_LABEL: Record<StudioFileGroup, string> = {
  web: "Web",
  mobile: "Mobile",
  data: "Backend",
  docs: "Docs",
};

export const STUDIO_FILES: readonly StudioFileDef[] = [
  {
    id: "app.html",
    artifactKey: "html",
    label: "app.html",
    language: "html",
    badge: "HTML",
    group: "web",
    zipPath: "app.html",
    emptyHint: "Génère une app ou demande à l’IA.",
  },
  {
    id: "App.tsx",
    artifactKey: "react",
    label: "App.tsx",
    language: "typescript",
    badge: "React",
    group: "web",
    zipPath: "src/App.tsx",
    emptyHint: "React web — « crée un composant login ».",
  },
  {
    id: "app/page.tsx",
    artifactKey: "nextjs",
    label: "app/page.tsx",
    language: "typescript",
    badge: "Next",
    group: "web",
    zipPath: "app/page.tsx",
    emptyHint: "Next.js — page App Router.",
  },
  {
    id: "package.json",
    artifactKey: "packageJson",
    label: "package.json",
    language: "json",
    badge: "NPM",
    group: "web",
    zipPath: "package.json",
    emptyHint: "Dépendances Next/React — généré avec le scaffold.",
  },
  {
    id: "App.native.tsx",
    artifactKey: "reactNative",
    label: "App.native.tsx",
    language: "typescript",
    badge: "RN",
    group: "mobile",
    zipPath: "App.native.tsx",
    emptyHint: "React Native — écran mobile.",
  },
  {
    id: "main.dart",
    artifactKey: "flutter",
    label: "lib/main.dart",
    language: "dart",
    badge: "Flutter",
    group: "mobile",
    zipPath: "lib/main.dart",
    emptyHint: "Flutter — point d’entrée (lib/main.dart).",
  },
  {
    id: "pubspec.yaml",
    artifactKey: "pubspec",
    label: "pubspec.yaml",
    language: "yaml",
    badge: "Pub",
    group: "mobile",
    zipPath: "pubspec.yaml",
    emptyHint: "Manifest Flutter — obligatoire pour un vrai projet.",
  },
  {
    id: "schema.sql",
    artifactKey: "sql",
    label: "schema.sql",
    language: "sql",
    badge: "SQL",
    group: "data",
    zipPath: "schema.sql",
    emptyHint: "Tables, index, RLS.",
  },
  {
    id: "api.ts",
    artifactKey: "api",
    label: "api.ts",
    language: "typescript",
    badge: "API",
    group: "data",
    zipPath: "api.ts",
    emptyHint: "Routes backend TypeScript.",
  },
  {
    id: "main.py",
    artifactKey: "python",
    label: "main.py",
    language: "python",
    badge: "Py",
    group: "data",
    zipPath: "main.py",
    emptyHint: "Backend Python / FastAPI.",
  },
  {
    id: "requirements.txt",
    artifactKey: "requirements",
    label: "requirements.txt",
    language: "plaintext",
    badge: "Pip",
    group: "data",
    zipPath: "requirements.txt",
    emptyHint: "Dépendances Python — généré avec le scaffold.",
  },
  {
    id: "README.md",
    artifactKey: "readme",
    label: "README.md",
    language: "markdown",
    badge: "MD",
    group: "docs",
    zipPath: "README.md",
    emptyHint: "Documentation du projet.",
  },
] as const;

export const STUDIO_FILE_IDS: StudioFileId[] = STUDIO_FILES.map((f) => f.id);

export const DEFAULT_STUDIO_FILE_ID: StudioFileId = "app.html";

const BY_ID = Object.fromEntries(
  STUDIO_FILES.map((f) => [f.id, f]),
) as Record<StudioFileId, StudioFileDef>;

export function getStudioFileDef(id: StudioFileId): StudioFileDef {
  return BY_ID[id];
}

export function studioFileIdToArtifactKey(id: StudioFileId): StudioArtifactKey {
  return BY_ID[id].artifactKey;
}

export function isStudioFileId(value: string): value is StudioFileId {
  return value in BY_ID;
}

export type StudioContentSnap = Partial<
  Record<StudioArtifactKey, string | null | undefined>
>;

/** Build Monaco/explorer rows from live content snap. */
export function buildStudioFileRows(snap: StudioContentSnap) {
  return STUDIO_FILES.map((def) => ({
    id: def.id,
    label: def.label,
    language: def.language,
    badge: def.badge,
    group: def.group,
    emptyHint: def.emptyHint,
    value: snap[def.artifactKey] ?? "",
  }));
}

/** ZIP entries for download (empty contents skipped by caller if needed). */
export function studioZipEntries(snap: StudioContentSnap) {
  return STUDIO_FILES.map((def) => ({
    path: def.zipPath,
    content: snap[def.artifactKey] || "",
  }));
}
