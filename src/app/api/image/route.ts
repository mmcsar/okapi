import {
  checkAndConsumeQuota,
  quotaExceededResponse,
  quotaKeyFromRequest,
} from "@/lib/llm-quota";
import {
  generateOpenRouterImage,
  openRouterConfigured,
} from "@/lib/openrouter";
import { assertBodySize, sanitizePublicError } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;

function cleanPrompt(prompt: string) {
  return prompt
    .trim()
    .slice(0, 220)
    .replace(/\s+/g, " ");
}

export function enrichImagePrompt(prompt: string) {
  const clean = cleanPrompt(prompt);
  if (/\b(high quality|detailed|4k|photorealistic)\b/i.test(clean)) {
    return clean;
  }
  return `${clean}, high quality, detailed`;
}

function urlPrompt(prompt: string) {
  return enrichImagePrompt(prompt)
    .replace(/[^\w\s\-.,]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function imageCandidateUrls(prompt: string, seed: number) {
  const q = encodeURIComponent(urlPrompt(prompt));
  const key = process.env.POLLINATIONS_API_KEY?.trim();
  const keyQs = key ? `&key=${encodeURIComponent(key)}` : "";

  return [
    `https://image.pollinations.ai/prompt/${q}?width=768&height=512&nologo=true&seed=${seed}${keyQs}`,
    `https://pollinations.ai/p/${q}?width=768&height=512&nologo=true&seed=${seed}`,
  ];
}

export function pollinationsImageUrl(prompt: string, seed?: number) {
  const s = typeof seed === "number" ? seed : Math.floor(Math.random() * 99999);
  return imageCandidateUrls(prompt, s)[0]!;
}

type Body = {
  prompt?: string;
  seed?: number;
};

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fallbackSvgDataUrl(prompt: string, reason?: string) {
  const title = escapeXml(cleanPrompt(prompt).slice(0, 72) || "Image Okapi");
  const hint = escapeXml(
    reason || "Image IA temporairement indisponible — réessaie dans un instant.",
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a3d2e"/>
      <stop offset="100%" stop-color="#0f241c"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="768" fill="url(#g)"/>
  <circle cx="780" cy="160" r="90" fill="#c4a35a" opacity="0.25"/>
  <text x="64" y="290" fill="#f4f1ea" font-family="Georgia, serif" font-size="42" font-weight="700">Okapi</text>
  <text x="64" y="350" fill="#d4c4a8" font-family="system-ui,sans-serif" font-size="26">${title}</text>
  <text x="64" y="410" fill="#9aab9f" font-family="system-ui,sans-serif" font-size="18">${hint}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * POST : cloud Okapi d’abord, sinon aperçu + tentative navigateur.
 */
export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 50_000);
  if (tooBig) return tooBig;

  const quota = checkAndConsumeQuota(quotaKeyFromRequest(request), "chat");
  if (!quota.ok) return quotaExceededResponse(quota);

  const body = (await request.json().catch(() => null)) as Body | null;
  const prompt = body?.prompt?.trim();
  if (!prompt || prompt.length < 3) {
    return Response.json(
      { error: "Décris l’image à créer (min. 3 caractères)." },
      { status: 400 },
    );
  }
  if (prompt.length > 500) {
    return Response.json({ error: "Prompt image trop long." }, { status: 400 });
  }

  const seed =
    typeof body?.seed === "number"
      ? body.seed
      : Math.floor(Math.random() * 99999);

  const upgradeUrls = imageCandidateUrls(prompt, seed);

  if (openRouterConfigured()) {
    const generated = await generateOpenRouterImage(prompt, {
      timeoutMs: 55_000,
    });
    if (generated?.dataUrl) {
      return Response.json({
        ok: true,
        url: generated.dataUrl,
        upgradeUrls,
        fallbackUrls: upgradeUrls,
        prompt,
        seed,
        mode: "okapi",
        provider: "okapi",
        note: "Image générée pour ton projet Okapi.",
      });
    }
    const reason =
      generated && "error" in generated && generated.error
        ? generated.error
        : "Okapi n’a pas pu générer l’image. Réessaie ou vérifie le crédit IA Okapi.";
    const safeNote = sanitizePublicError(reason);
    return Response.json({
      ok: true,
      url: fallbackSvgDataUrl(prompt, safeNote.slice(0, 90)),
      upgradeUrls,
      fallbackUrls: upgradeUrls,
      prompt,
      seed,
      mode: "fallback",
      provider: "okapi",
      note: safeNote,
    });
  }

  return Response.json({
    ok: true,
    url: fallbackSvgDataUrl(
      prompt,
      "Service image Okapi non configuré — contacte l’admin MMC.",
    ),
    upgradeUrls,
    fallbackUrls: upgradeUrls,
    prompt,
    seed,
    mode: "fallback",
    provider: "okapi",
    note: "Service image Okapi non configuré.",
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prompt = searchParams.get("prompt")?.trim() || "Okapi";
  const svg = fallbackSvgDataUrl(prompt).replace(
    /^data:image\/svg\+xml;charset=utf-8,/,
    "",
  );
  return new Response(decodeURIComponent(svg), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
