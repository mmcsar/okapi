import { testRoutesAllowed } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  if (!testRoutesAllowed()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    return Response.json(
      { ok: false, error: "Configuration indisponible." },
      { status: 500 },
    );
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest";

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: "Réponds seulement: OKAPI_GEMINI_OK" }],
            },
          ],
        }),
        cache: "no-store",
      },
    );

    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } | null;

    if (!res.ok) {
      return Response.json(
        {
          ok: false,
          status: res.status,
          error: data?.error?.message ?? `Erreur HTTP ${res.status}`,
          model,
        },
        { status: res.status },
      );
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "";

    return Response.json({
      ok: true,
      model,
      sample: text.slice(0, 120),
      message: `Gemini OK · modèle ${model}`,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Erreur Gemini",
      },
      { status: 500 },
    );
  }
}
