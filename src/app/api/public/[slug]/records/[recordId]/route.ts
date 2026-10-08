import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; recordId: string }> };

/**
 * Public share links are read + create (forms) only.
 * Update/delete require the owner Preview (authenticated /api/apps/...).
 * This blocks anonymous wipe/rewrite of shared app data.
 */
function forbidden() {
  return NextResponse.json(
    {
      error:
        "Modification publique désactivée. Seul le propriétaire peut modifier ou supprimer.",
      code: "okapi_public_read_create_only",
    },
    { status: 403 },
  );
}

export async function PATCH(_request: Request, _ctx: Ctx) {
  return forbidden();
}

export async function DELETE(_request: Request, _ctx: Ctx) {
  return forbidden();
}
