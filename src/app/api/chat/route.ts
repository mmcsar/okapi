import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { languageInstruction } from "@/lib/i18n";
import { friendlyLlmError, isLocationBlocked } from "@/lib/llm-errors";
import { missingLlmMessage, pickLlmProvider } from "@/lib/llm-provider";
import {
  checkAndConsumeQuota,
  quotaExceededResponse,
  quotaKeyFromRequest,
} from "@/lib/llm-quota";
import { openAiConfigured, streamOpenAiChat } from "@/lib/openai";
import {
  openRouterConfigured,
  streamOpenRouterChat,
} from "@/lib/openrouter";
import { resolveEngine, type OkapiEngine } from "@/lib/okapi-engine";
import { normalizeImageMime } from "@/lib/image";
import { assertBodySize } from "@/lib/security";
import type { OkapiAgentLane } from "@/lib/intent";
import { wantsLiveCurrentFact } from "@/lib/intent";
import {
  formatVerifiedOfficeAnswer,
  liveFactSystemBlock,
  resolveLiveOfficeFact,
} from "@/lib/live-facts";

export const runtime = "nodejs";

function buildSystem(
  language?: string | null,
  debug = false,
  lane: OkapiAgentLane = "conseil",
) {
  const debugBlock = debug
    ? `
DEBUG MODE:
- The user reports a bug or pasted an error without a live Preview open.
- Diagnose clearly: likely cause → steps to fix → what to try next.
- If they should open/build a project first, say so briefly.
- Never name third-party AI or database vendors.
`
    : "";

  const laneBlock =
    lane === "creer"
      ? `
LANE = CRÉATEUR (builders / apps):
- Ask to build/modify an app or site → give a short plan (3–5 bullets) THEN tell the user to send the same brief again starting with « Crée… » so Okapi Preview can build it. Do not invent that the builder is missing from Accueil.
- Never claim the app/site is already built, deployed, or live unless the user has a Preview in this session — a plan is not a finished app.
- If the user already described catalogue/stock/panier/Mobile Money: confirm in one short sentence and ask them to type: « Crée une app boutique: catalogue, stock, panier, WhatsApp, Mobile Money CDF ».
- You may mention Studio only as optional next step after a preview exists — never as the first destination.
`
      : `
LANE = CONSEILLER (savoir / contenu / recherche):
- Answer questions, research, advice, drafts (articles, posts, scripts, letters). Stay helpful in this chat.
- Credibility is everything: a false fact destroys trust. Prefer « je ne sais pas / à vérifier » over a guessed name or date.
- Do NOT push Studio, code editors, or “ouvre Studio”. Do NOT invent that a constructor is missing.
- Only if the user explicitly asks to create an app/site: say they can switch to mode « Créateur » on Accueil, or type « Crée une app… » — do not open Studio for them.
- Never pitch apps/templates unsolicited.
`;

  return `You are Okapi, the AI platform of MMC SARL (Democratic Republic of Congo).
You are a single autonomous AI agent for users of Okapi.
You have NO live internet browse in this chat — your knowledge can be outdated. Never invent “current” office-holders or today’s news to fill gaps.

TRUTH FIRST (non-negotiable):
- Never invent facts, numbers, prices, laws, news, URLs, screenshots, files, or “I already did X” when you did not.
- If unsure or outdated: say so clearly (« je ne suis pas sûr », « à vérifier ») — prefer honesty over a confident wrong answer.
- Current politics / office-holders (gouverneurs, ministres, maires en RDC): if you are not highly confident of the CURRENT name, do NOT invent or guess a person. Say you are unsure and tell the user to check the site officiel de la province or Radio Okapi / Actualite.cd. A wrong name is worse than « je ne sais pas ».
- Do not invent capabilities Okapi does not have in this chat. Only describe what Accueil Agent / Preview / Studio can actually do.
- Never fabricate image links or pretend an image was generated in your text reply — image generation is a separate action when the user types « crée une image… ».
- Never invent that a service failed or succeeded without evidence from this conversation.

Core rule: act ONLY on request. Do what is necessary, nothing more.
- Question → answer clearly, no useless digressions.
${laneBlock}
- Image creation: on Accueil, the user can ask « crée une image… » / logo / illustration — Okapi then runs image generation and shows the result in the chat UI. Explain how to ask; do not invent fake image URLs. If generation fails (credit, network), the UI will say so — do not promise success.
- Vision: when an image is attached in this request, you can see it — describe carefully; if text is blurry or uncertain, say so instead of inventing.
- If asked who hosts data: say Okapi / MMC SARL cloud. Never name third-party database vendors.
- Do not spontaneously pitch apps, templates, or marketing menus.
- If asked who you are / who built you: you are Okapi, plateforme IA de MMC SARL. Never mention third-party model vendors.
${debugBlock}
${languageInstruction(language)}

Style: clear, concise, useful, honest. Prefer « je ne sais pas » to a lie.
In French UI context: when giving advice/facts, once per reply max: « Okapi peut se tromper — vérifie les infos importantes ».
You are not a doctor or lawyer.`;
}

type ChatBody = {
  message?: string;
  sector?: string;
  language?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  image?: { mimeType?: string; base64?: string; name?: string };
  debug?: boolean;
  engine?: string;
  /** conseil = savoir/contenu · creer = apps */
  lane?: string;
};

type ImagePart = { mimeType: string; base64: string };

export async function POST(request: Request) {
  // Images base64 compressées ~ < 2 Mo ; marge pour historique
  const tooBig = assertBodySize(request, 8_000_000);
  if (tooBig) return tooBig;

  const provider = pickLlmProvider();
  if (!provider) {
    return Response.json({ error: missingLlmMessage() }, { status: 500 });
  }

  const quota = checkAndConsumeQuota(quotaKeyFromRequest(request), "chat");
  if (!quota.ok) return quotaExceededResponse(quota);

  const body = (await request.json().catch(() => null)) as ChatBody | null;
  const imageBase64 = body?.image?.base64?.replace(/\s/g, "").trim();
  const imageMimeRaw = body?.image?.mimeType?.trim() || "image/jpeg";
  const imageName = body?.image?.name?.trim();
  const imageMime = normalizeImageMime(imageMimeRaw, imageName);
  const hasImage = Boolean(imageBase64 && imageBase64.length > 32);
  const message =
    body?.message?.trim() ||
    (hasImage
      ? "Décris cette image clairement et dis ce qui est utile."
      : "");
  if (!message) {
    return Response.json({ error: "Message vide." }, { status: 400 });
  }
  if (body?.image && !hasImage) {
    return Response.json(
      {
        error:
          "Image illisible. Réessaie avec un JPG ou PNG (max ~8 Mo avant compression).",
      },
      { status: 400 },
    );
  }

  const sector = body?.sector?.trim();
  const language = body?.language?.trim() || "auto";
  const engine = resolveEngine(body?.engine);
  const lane: OkapiAgentLane =
    body?.lane === "creer" ? "creer" : "conseil";
  const liveFact = wantsLiveCurrentFact(message);
  let liveBlock = "";
  let verifiedDirect: string | null = null;
  if (liveFact) {
    const packet = await resolveLiveOfficeFact(message);
    if (packet) {
      verifiedDirect = formatVerifiedOfficeAnswer(packet);
      liveBlock = liveFactSystemBlock(packet);
    } else {
      liveBlock = `

LIVE / CURRENT OFFICE-HOLDER QUESTION — HARD RULE:
You do NOT have verified live data for this answer.
FORBIDDEN: inventing or guessing any person’s name as the current gouverneur / ministre / maire / président.
REQUIRED: say you cannot confirm without an official source; point to .gouv.cd / Radio Okapi / Actualite.cd.
End with: « Okapi peut se tromper — vérifie les infos importantes ».`;
    }
  }

  // Fait vérifié → réponse directe (pas de LLM qui invente un autre nom)
  if (verifiedDirect) {
    return new Response(verifiedDirect, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Okapi-Provider": "okapi",
        "X-Okapi-Fact": "verified",
      },
    });
  }

  const system =
    buildSystem(language, Boolean(body?.debug), lane) +
    (hasImage
      ? `\n\nVISION: An image is attached — you can see it. Describe accurately in the user’s language. If something is unclear, blurry, or illegible, say so — do not invent text or details.`
      : "") +
    liveBlock;
  const history = Array.isArray(body?.history) ? body.history.slice(-16) : [];
  const userContent = sector
    ? lane === "creer"
      ? `[Builder context (optional): ${sector}]\n\n${message}`
      : `[Contexte métier (optionnel): ${sector}]\n\n${message}`
    : message;
  const image: ImagePart | null = hasImage
    ? { mimeType: imageMime, base64: imageBase64! }
    : null;

  // Conseiller : température basse = moins d’invention
  const temperature = lane === "conseil" || liveFact ? 0.25 : 0.55;

  if (provider === "openai") {
    return streamViaOpenAi(userContent, history, image, system, engine, temperature);
  }
  if (provider === "openrouter") {
    return streamViaOpenRouter(
      userContent,
      history,
      image,
      system,
      engine,
      temperature,
    );
  }
  if (provider === "gemini") {
    return streamGemini(userContent, history, image, system);
  }
  return streamClaude(userContent, history, image, system);
}

function toOpenRouterMessages(
  userContent: string,
  history: { role: "user" | "assistant"; content: string }[],
  image: ImagePart | null,
) {
  const messages: Array<{
    role: "user" | "assistant";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        >;
  }> = history
    .filter((m) => m.content?.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  if (image) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userContent },
        {
          type: "image_url",
          image_url: {
            url: `data:${image.mimeType};base64,${image.base64}`,
          },
        },
      ],
    });
  } else {
    messages.push({ role: "user", content: userContent });
  }
  return messages;
}

async function streamViaOpenAi(
  userContent: string,
  history: { role: "user" | "assistant"; content: string }[],
  image: ImagePart | null,
  system: string,
  engine: OkapiEngine = "flash",
  temperature = 0.4,
) {
  try {
    return await streamOpenAiChat({
      system,
      engine,
      messages: toOpenRouterMessages(userContent, history, image),
      temperature,
    });
  } catch (err) {
    return new Response(`\n\n${friendlyLlmError(err)}`, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Okapi-Provider": "okapi",
      },
    });
  }
}

async function streamViaOpenRouter(
  userContent: string,
  history: { role: "user" | "assistant"; content: string }[],
  image: ImagePart | null,
  system: string,
  engine: OkapiEngine = "flash",
  temperature = 0.4,
) {
  try {
    return await streamOpenRouterChat({
      system,
      engine,
      messages: toOpenRouterMessages(userContent, history, image),
      vision: Boolean(image),
      temperature,
    });
  } catch (err) {
    return new Response(`\n\n${friendlyLlmError(err)}`, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Okapi-Provider": "okapi",
      },
    });
  }
}

function toGeminiContents(
  userContent: string,
  history: { role: "user" | "assistant"; content: string }[],
  image: ImagePart | null,
) {
  const userParts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: userContent }];
  if (image) {
    userParts.push({
      inlineData: { mimeType: image.mimeType, data: image.base64 },
    });
  }

  return [
    ...history
      .filter((m) => m.content?.trim())
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    { role: "user", parts: userParts },
  ];
}

async function streamGemini(
  userContent: string,
  history: { role: "user" | "assistant"; content: string }[],
  image: ImagePart | null,
  system: string,
) {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest";
  const ai = new GoogleGenAI({ apiKey: key });
  const contents = toGeminiContents(userContent, history, image);
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        try {
          const stream = await ai.models.generateContentStream({
            model,
            contents,
            config: {
              systemInstruction: system,
              maxOutputTokens: 8192,
            },
          });

          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (streamErr) {
            if (
              isLocationBlocked(streamErr) &&
              (openAiConfigured() || openRouterConfigured())
            ) {
              controller.enqueue(
                encoder.encode("Okapi reconnecte le service…\n\n"),
              );
            const res = openAiConfigured()
              ? await streamOpenAiChat({
                  system,
                  messages: toOpenRouterMessages(userContent, history, image),
                })
              : await streamOpenRouterChat({
                  system,
                  messages: toOpenRouterMessages(userContent, history, image),
                });
            const reader = res.body?.getReader();
            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) controller.enqueue(value);
              }
            }
            controller.close();
            return;
          }

          try {
            const result = await ai.models.generateContent({
              model,
              contents,
              config: {
                systemInstruction: system,
                maxOutputTokens: 8192,
              },
            });
            const text = result.text?.trim();
            if (text) {
              controller.enqueue(encoder.encode(text));
            } else {
              throw streamErr;
            }
          } catch (err) {
            if (
              isLocationBlocked(err) &&
              (openAiConfigured() || openRouterConfigured())
            ) {
              controller.enqueue(
                encoder.encode("Okapi reconnecte le service…\n\n"),
              );
              const res = openAiConfigured()
                ? await streamOpenAiChat({
                    system,
                    messages: toOpenRouterMessages(userContent, history, image),
                  })
                : await streamOpenRouterChat({
                    system,
                    messages: toOpenRouterMessages(userContent, history, image),
                  });
              const reader = res.body?.getReader();
              if (reader) {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (value) controller.enqueue(value);
                }
              }
            } else {
              controller.enqueue(
                encoder.encode(`\n\n${friendlyLlmError(err)}`),
              );
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(`\n\n${friendlyLlmError(err)}`),
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Okapi-Provider": "okapi",
    },
  });
}

async function streamClaude(
  userContent: string,
  history: { role: "user" | "assistant"; content: string }[],
  image: ImagePart | null,
  system: string,
) {
  const key = process.env.ANTHROPIC_API_KEY!;
  const anthropic = new Anthropic({ apiKey: key });
  const userContentBlock: Anthropic.MessageParam["content"] = image
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: image.mimeType as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: image.base64,
          },
        },
        { type: "text", text: userContent },
      ]
    : userContent;

  const messages: Anthropic.MessageParam[] = [
    ...history
      .filter((m) => m.content?.trim())
      .map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContentBlock },
  ];

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system,
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(`\n\n${friendlyLlmError(err)}`),
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Okapi-Provider": "okapi",
    },
  });
}
