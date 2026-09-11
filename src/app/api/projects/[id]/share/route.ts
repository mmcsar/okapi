import { NextResponse } from "next/server";
import { requireUser, type OkapiProject } from "@/lib/supabase";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function makeShareSlug() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Active le partage public et renvoie le slug. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as {
    enabled?: boolean;
  } | null;
  const enabled = body?.enabled !== false;

  if (!enabled) {
    const { data, error } = await auth.session.supabase
      .from("projects")
      .update({ is_public: false })
      .eq("id", id)
      .eq("user_id", auth.session.user.id)
      .select(
        "id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug",
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, project: data as OkapiProject });
  }

  const { data: existing, error: readErr } = await auth.session.supabase
    .from("projects")
    .select("id, share_slug, is_public")
    .eq("id", id)
    .eq("user_id", auth.session.user.id)
    .maybeSingle();

  if (readErr) {
    const missing = /column|share_slug|is_public|does not exist/i.test(
      readErr.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? "Partage temporairement indisponible. Réessaie plus tard."
          : readErr.message,
        setupRequired: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const share_slug = existing.share_slug || makeShareSlug();
  const { data, error } = await auth.session.supabase
    .from("projects")
    .update({ is_public: true, share_slug })
    .eq("id", id)
    .eq("user_id", auth.session.user.id)
    .select(
      "id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    project: data as OkapiProject,
    url: `/p/${share_slug}`,
  });
}
