/** Brouillon invité — survit à la connexion Google / email. */

export const OKAPI_GUEST_DRAFT_KEY = "okapi-guest-draft-v1";

export type GuestDraftArtifacts = {
  react?: string | null;
  reactNative?: string | null;
  nextjs?: string | null;
  packageJson?: string | null;
  sql?: string | null;
  api?: string | null;
  python?: string | null;
  requirements?: string | null;
  flutter?: string | null;
  pubspec?: string | null;
  readme?: string | null;
};

export type GuestDraft = {
  v: 1;
  savedAt: number;
  title: string;
  sector: string;
  html: string;
  summary?: string;
  artifacts: GuestDraftArtifacts;
};

export function writeGuestDraft(draft: Omit<GuestDraft, "v" | "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const payload: GuestDraft = {
      v: 1,
      savedAt: Date.now(),
      title: draft.title || "Projet Okapi",
      sector: draft.sector || "Général",
      html: draft.html || "",
      summary: draft.summary,
      artifacts: draft.artifacts || {},
    };
    const hasContent =
      Boolean(payload.html.trim()) ||
      Object.values(payload.artifacts).some(
        (v) => typeof v === "string" && v.trim(),
      );
    if (!hasContent) return;
    window.localStorage.setItem(OKAPI_GUEST_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function readGuestDraft(): GuestDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OKAPI_GUEST_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestDraft;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearGuestDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(OKAPI_GUEST_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
