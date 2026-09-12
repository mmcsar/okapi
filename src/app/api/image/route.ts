import {
  checkAndConsumeQuota,
  quotaExceededResponse,
  quotaKeyFromRequest,
} from "@/lib/llm-quota";
import { assertBodySize } from "@/lib/security";

export const runtime = "nodejs";

/** Build a public image URL (works without paid image API). */
export function pollinationsImageUrl(prompt: string, seed?: number) {
  const clean = prompt
    .trim()
    .slice(0, 220)
    .replace(/\s+/g, " ");
  const q = encodeURIComponent(clean);
  const s = typeof seed === "number" ? seed : Math.floor(Math.random() * 99999);
  return `https://image.pollinations.ai/prompt/${q}?width=1024&height=768&nologo=true&seed=${s}`;
}

type Body = {
  prompt?: string;
  seed?: number;
};

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

  const url = pollinationsImageUrl(prompt, body?.seed);
  return Response.json({
    ok: true,
    url,
    prompt,
    provider: "okapi",
    note: "Image générée pour ton projet Okapi.",
  });
}
