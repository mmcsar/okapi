import { NextResponse } from "next/server";
import { getSupabase, type OkapiProject } from "@/lib/supabase";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const clean = slug?.trim();
  if (!clean) {
    return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id, title, sector, html, summary, created_at, updated_at, is_public, share_slug",
      )
      .eq("share_slug", clean)
      .eq("is_public", true)
      .maybeSingle();

    if (error) {
      const missing = /column|share_slug|is_public|does not exist/i.test(
        error.message,
      );
      return NextResponse.json(
        {
          error: missing
            ? "Partage temporairement indisponible. Réessaie plus tard."
            : error.message,
          setupRequired: missing,
        },
        { status: missing ? 503 : 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Lien introuvable ou plus public." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      project: data as OkapiProject,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Erreur lecture publique",
      },
      { status: 500 },
    );
  }
}
