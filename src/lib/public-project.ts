import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

export type PublicProjectRow = {
  id: string;
  user_id: string;
  title: string;
  sector: string | null;
  html: string | null;
  summary: string | null;
  share_slug: string;
  is_public: boolean;
};

/** Projet public par slug (service role) — null si introuvable / privé. */
export async function resolvePublicProjectBySlug(
  slug: string,
): Promise<
  | { ok: true; project: PublicProjectRow }
  | { ok: false; status: number; error: string; setupRequired?: boolean }
> {
  const clean = slug.trim();
  if (!clean) {
    return { ok: false, status: 400, error: "Lien invalide." };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Partage temporairement indisponible.",
      setupRequired: true,
    };
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("projects")
      .select(
        "id, user_id, title, sector, html, summary, share_slug, is_public",
      )
      .eq("share_slug", clean)
      .eq("is_public", true)
      .maybeSingle();

    if (error) {
      const missing = /column|share_slug|is_public|does not exist/i.test(
        error.message,
      );
      return {
        ok: false,
        status: missing ? 503 : 500,
        error: missing
          ? "Partage temporairement indisponible."
          : error.message,
        setupRequired: missing,
      };
    }

    if (!data) {
      return {
        ok: false,
        status: 404,
        error: "Lien introuvable ou plus public.",
      };
    }

    return { ok: true, project: data as PublicProjectRow };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "Erreur lecture publique",
    };
  }
}
