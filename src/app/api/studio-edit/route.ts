import { friendlyLlmError } from "@/lib/llm-errors";
import { missingLlmMessage, pickLlmProvider } from "@/lib/llm-provider";
import {
  checkAndConsumeQuota,
  quotaExceededResponse,
  quotaKeyFromRequest,
} from "@/lib/llm-quota";
import { openAiComplete } from "@/lib/openai";
import { openRouterComplete } from "@/lib/openrouter";
import { resolveEngine } from "@/lib/okapi-engine";
import { assertBodySize } from "@/lib/security";

export const runtime = "nodejs";

const FILE_HINTS: Record<string, string> = {
  "app.html": "Complete single-file HTML document (start with <!DOCTYPE html>).",
  "App.tsx": "React + TypeScript component file (functional components, modern React).",
  "App.native.tsx":
    "React Native screen/component (TypeScript). Use react-native primitives (View, Text, Pressable, StyleSheet). No DOM/HTML. No markdown fences.",
  "app/page.tsx":
    "Next.js App Router page.tsx (TypeScript). Use server/client components correctly. Export default page component. No markdown fences.",
  "schema.sql":
    "PostgreSQL schema: tables, constraints, indexes, optional RLS policies. SQL only. Comments in French OK.",
  "api.ts":
    "Backend API stubs in TypeScript (REST handlers or Next.js route.ts style). No markdown fences.",
  "README.md": "Markdown documentation in French.",
  "main.py": "Python 3 script or FastAPI-style stubs. No markdown fences.",
  "main.dart": "Flutter / Dart widget code. No markdown fences.",
};

type Body = {
  instruction?: string;
  fileId?: string;
  fileLabel?: string;
  language?: string;
  content?: string;
  engine?: string;
};

function stripFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:[\w.+-]*)?\s*\n?([\s\S]*?)\n?```$/);
  return (fenced?.[1] ?? trimmed).trim();
}

function buildSystem(fileId: string, language: string) {
  const hint = FILE_HINTS[fileId] || `Source file (${language}).`;
  return `You are Okapi Studio AI (MMC SARL). You edit code inside Okapi Studio.

Rules:
- Return ONLY the full updated file content for the active file.
- No markdown fences, no explanations before/after the code.
- Keep the user's intent. Improve or create code as asked.
- Never name third-party AI/cloud vendors in comments or UI strings (say Okapi / MMC SARL).
- Do not embed secrets, API keys, tokens, or credentials.
- Code is produced for the Okapi user project; keep it clean and professional.
- File target: ${fileId}
- Expected format: ${hint}
- Prefer French for UI strings / README when the user writes in French.`;
}

async function complete(opts: {
  system: string;
  user: string;
  engine: ReturnType<typeof resolveEngine>;
}) {
  const provider = pickLlmProvider();
  if (!provider) throw new Error(missingLlmMessage());

  if (provider === "openai") {
    return openAiComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: 7000,
      engine: opts.engine,
    });
  }
  if (provider === "openrouter") {
    return openRouterComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: 7000,
      engine: opts.engine,
    });
  }
  throw new Error(missingLlmMessage());
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 1_500_000);
  if (tooBig) return tooBig;

  if (!pickLlmProvider()) {
    return Response.json({ error: missingLlmMessage() }, { status: 500 });
  }

  const quota = checkAndConsumeQuota(quotaKeyFromRequest(request), "chat");
  if (!quota.ok) return quotaExceededResponse(quota);

  const body = (await request.json().catch(() => null)) as Body | null;
  const instruction = body?.instruction?.trim();
  if (!instruction) {
    return Response.json({ error: "Dis ce que tu veux modifier." }, { status: 400 });
  }
  if (instruction.length > 8000) {
    return Response.json(
      { error: "Instruction trop longue." },
      { status: 400 },
    );
  }

  const fileId = body?.fileId?.trim() || "app.html";
  if (!FILE_HINTS[fileId]) {
    return Response.json({ error: "Fichier non autorisé." }, { status: 400 });
  }

  const fileLabel = body?.fileLabel?.trim() || fileId;
  const language = body?.language?.trim() || "plaintext";
  const content = (body?.content ?? "").slice(0, 400_000);
  const engine = resolveEngine(body?.engine);

  const system = buildSystem(fileId, language);
  const user = `Active file: ${fileLabel} (${language})
Instruction: ${instruction}

Current file content:
-----
${content || "(empty file — create from scratch)"}
-----

Return the FULL new file content only.`;

  try {
    const raw = await complete({ system, user, engine });
    const next = stripFences(raw);
    if (!next) {
      return Response.json(
        { error: "L’IA n’a renvoyé aucun code. Réessaie." },
        { status: 502 },
      );
    }
    return Response.json({
      ok: true,
      fileId,
      content: next,
      note: `Fichier ${fileLabel} mis à jour.`,
    });
  } catch (err) {
    return Response.json({ error: friendlyLlmError(err) }, { status: 502 });
  }
}
