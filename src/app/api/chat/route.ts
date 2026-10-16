import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { honestyClosing, languageInstruction } from "@/lib/i18n";
import { friendlyLlmError, isLocationBlocked } from "@/lib/llm-errors";
import { missingLlmMessage, pickWithClaude } from "@/lib/llm-provider";
import {
  resolveEngineForPlan,
  resolveLlmAccess,
} from "@/lib/llm-access";
import {
  checkAndConsumeQuota,
  quotaExceededResponse,
  quotaKeyFromRequest,
} from "@/lib/llm-quota";
import { openAiConfigured, streamOpenAiChat } from "@/lib/openai";
import {
  openRouterConfigured,
  resolveChatReasoningEffort,
  streamOpenRouterChat,
  type OkapiReasoningEffort,
} from "@/lib/openrouter";
import type { OkapiEngine } from "@/lib/okapi-engine";
import { normalizeImageMime } from "@/lib/image";
import { assertBodySize } from "@/lib/security";
import type { OkapiAgentLane } from "@/lib/intent";
import { wantsLiveCurrentFact, wantsMathDiagram } from "@/lib/intent";
import { diagramSystemBlock } from "@/lib/chat-diagram";
import {
  formatUnverifiedOfficeAnswer,
  formatVerifiedOfficeAnswer,
  resolveLiveOfficeFact,
} from "@/lib/live-facts";
import {
  formatCalendarAnswer,
  shouldServeCalendar,
} from "@/lib/chat-calendar";
import {
  researchGroundingSystemBlock,
  resolveResearchGrounding,
} from "@/lib/research-grounding";
import {
  intelligenceSystemBlock,
  loadUserIntelligenceContext,
} from "@/lib/okapi-intelligence";
import {
  okapiTurnBrief,
  turnNeedsDeepReasoning,
} from "@/lib/okapi-reasoning";
import { getUserFromAuthHeader } from "@/lib/supabase";
import {
  OKAPI_STUDIO_STACK,
  OKAPI_STUDIO_STACK_HONESTY,
} from "@/lib/studio-files";

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
- STACK Okapi Studio / Preview: ${OKAPI_STUDIO_STACK}. Preview live = surtout app.html. React/Next/Flutter/Python = fichiers Studio + ZIP (pas Preview native sauf HTML).
- If the user asks Java, C#, Go, PHP, Ruby, Rust, Kotlin (hors Flutter), Swift, etc.: answer in French like: « Okapi livre ${OKAPI_STUDIO_STACK}. Pour Java (ou …), je peux t’expliquer / te donner un extrait, pas un projet Studio complet. » Then offer an HTML/React/Flutter equivalent if they want a buildable Okapi app. Never promise Studio Accept / Preview for unsupported languages.
- If the user message already starts with « Crée… » / « Génère… » / « Fais une app… »: the Accueil UI builds the Preview — reply in 1–2 short sentences (what will appear). Do NOT ask them to resend the same brief. Do NOT invent that the app is already finished before Preview exists.
- If they describe an app WITHOUT « Crée… »: give a very short plan (max 3 bullets) + ONE ready-to-copy line starting with « Crée… ». No long essays.
- Prefer RDC defaults when relevant: prix CDF, WhatsApp, Mobile Money (M-Pesa / Airtel / Orange), français simple.
- Never claim the app/site is already built, deployed, or live unless the user has a Preview in this session.
- Video / clip: not available — do not pitch vidéo.
- Studio only as optional next step after a preview exists — never first.
`
      : `
LANE = CONSEILLER (savoir / contenu / recherche):
- Answer questions, research, advice, drafts (articles, posts, scripts, letters). Stay helpful in this chat.
- Credibility is everything: a false fact destroys trust. Prefer « je ne sais pas / à vérifier » over a guessed name or date.
- When RESEARCH GROUNDING excerpts are provided: factual claims MUST come from those excerpts only.
- Coding help: you may explain any language and show short excerpts. Full Okapi projects / Preview only for ${OKAPI_STUDIO_STACK} — if they ask to « créer un projet Java/C#… » in Okapi, say clearly: ${OKAPI_STUDIO_STACK_HONESTY}
- Do NOT push Studio, code editors, or “ouvre Studio”. Do NOT invent that a constructor is missing.
- Only if the user explicitly asks to create an app/site: say they can switch to mode « Créateur » on Accueil, or type « Crée une app… » — do not open Studio for them.
- Never pitch apps/templates unsolicited.
- For RDC business / admin / daily life: be concrete (CDF, WhatsApp, procédures simples, villes connues) — no generic Silicon Valley advice.
`;

  return `You are Okapi, the AI platform of MMC SARL (Democratic Republic of Congo).
You are a single autonomous AI agent for users of Okapi.
You do NOT open-browse the web freely. When RESEARCH GROUNDING excerpts are present, base factual claims on those excerpts only. Without grounding, your knowledge can be outdated — never invent “current” office-holders or today’s news to fill gaps.

TRUTH FIRST (non-negotiable):
- Never invent facts, numbers, prices, laws, news, URLs, screenshots, files, or “I already did X” when you did not.
- If unsure or outdated: say so clearly (« je ne suis pas sûr », « à vérifier ») — prefer honesty over a confident wrong answer.
- Current politics / office-holders (gouverneurs, ministres, maires en RDC): if you are not highly confident of the CURRENT name, do NOT invent or guess a person. Say you are unsure and tell the user to check the site officiel de la province or Radio Okapi / Actualite.cd. A wrong name is worse than « je ne sais pas ».
- Do not invent capabilities Okapi does not have in this chat. Only describe what Accueil Agent / Preview / Studio can actually do.
- Studio / Preview stack honesty: ${OKAPI_STUDIO_STACK_HONESTY}
- Never fabricate image or video links. Image generation runs only when the user types « crée une image… ». Do not name third-party vendors.
- Video: temporarily unavailable in Accueil — if asked, say briefly that vidéo Okapi revient bientôt; do not invent a video URL or claim generation started.
- Never invent that a service failed or succeeded without evidence from this conversation.

Core rule: act ONLY on request. Do what is necessary, nothing more.
- Question → answer clearly, no useless digressions.
${laneBlock}
- Image creation: Accueil intercepts « crée une image… » / logo / illustration with a dedicated image model (not this chat model / not Opus). Never claim you drew or generated an image in text. Do not invent fake image URLs. If they ask how: tell them to type « crée une image… » plus the subject.
- Video creation: DISABLED for now — do not tell users to type « crée une vidéo… ».
- Vision: when an image is attached in this request, you can see it — describe carefully; if text is blurry or uncertain, say so instead of inventing.
- If asked who hosts data: say Okapi / MMC SARL cloud. Never name third-party database vendors.
- Do not spontaneously pitch apps, templates, or marketing menus.
- COMPANY FACTS (canonical — confirm with certainty when asked; never hedge, never say you lack a public source, never ask the user to verify these names):
  · Fondateur et ingénieur d’Okapi / MMC SARL : M. Christian Kazadi.
  · Directrice générale (DG) : Madame Fidelie Nzeba.
  · You are Okapi, plateforme IA de MMC SARL.
  Only state these when the user asks who you are / who built or founded Okapi / who leads MMC or who is the DG. Never mention them spontaneously. Never mention third-party model vendors. Do not append « Okapi peut se tromper » on these company-identity answers.
${debugBlock}
${languageInstruction(language)}

Style: clear, concise, useful, honest — like a senior advisor in Kinshasa, not a chatbot script. Prefer « je ne sais pas » to a lie.
PROFESSIONAL TONE (non-negotiable):
- Never open with « Je comprends votre demande », « Bien sûr ! », « Absolument », « Excellente question », or a lecture about Okapi’s capabilities.
- Never invent a procedure (« connectez-vous », « allez dans Accueil », « la plateforme gère… ») instead of answering.
- Lead with the useful answer in the first sentence. No preamble, no self-presentation.
- Sound confident and concrete; avoid corporate filler and fake empathy.
LENGTH: default SHORT — answer first, then at most 3–5 bullets if useful. No long intros, no repeating the question, no lists of 10 items unless asked. Exception: when RESEARCH GROUNDING is present, give a denser useful answer (≈8–12 lines or short bullets) with 1–2 citations — still plain text, no fluff.
NO FILLER: never end with « Veux-tu que… », « Dis-moi si… », « N’hésite pas… » unless the user asked for options. One complete answer is enough.
PLAIN TEXT ONLY in replies: no Markdown. Never use **bold**, *italic*, __underscores__, # headings, or \`code\` fences (exception: diagram SVG markers <<<SVG … SVG>>> when a DIAGRAM REQUEST block is present — NEVER for calendars). Emphasize with words or CAPS sparingly, not asterisks. Lists: use « - » or « 1. » only.
DIAGRAMS: for axes x/y, arrows, statistical charts, curves — use the DIAGRAM REQUEST SVG markers when provided. Do not say you cannot draw; produce a clean SVG figure.
CALENDARS: never invent a calendar (text, SVG, or “how to open Accueil”). Never say you cannot show a calendar or that the user must connect elsewhere. Calendar requests are handled outside this model — if one slips through, reply with exactly: « Voici le calendrier. » and stop.
REASONING: for calculations, logic checks, hard questions, or multi-step plans — think carefully, verify each step, then conclude. Prefer a short correct answer over a long vague one. Show units (CDF, %, etc.) clearly. If two interpretations exist, pick the most useful for a user in RDC and say so briefly.
DOCUMENTS: when a DOCUMENT is attached (text/CSV), analyse that content: summarize, extract tables/figures, flag risks or missing clauses. Do not invent clauses or cells not in the text. Native .xlsx / scanned PDF are not supported yet — if asked, say to export CSV or paste the text.
RDC LENS: when relevant, think Kinshasa / provinces, CDF, Mobile Money, WhatsApp, French (or user’s language), low-bandwidth UX — practical for Congo, not generic US startup tips.
CAPABILITIES (only if the user asks what Okapi can do / future improvements — no invented MMC roadmap):
- Voix: déjà disponible sur Accueil (micro + bouton Écouter).
- Images / vision + « crée une image… » (vidéo temporairement indisponible).
- Schémas maths/stats (axes x-y, flèches, courbes, histogrammes) en SVG dans le chat.
- Documents texte/CSV/MD joints dans le chat.
- Mémoire du compte connecté (nom, profil) + projets cloud.
- Ne promets pas de features inexistantes ; oriente les retours vers l’équipe Okapi.
When giving advice/facts, once per reply max end with: « ${honestyClosing(language)} » (or the same idea in the user’s language if Auto).
You are not a doctor or lawyer.`;
}

type ChatBody = {
  message?: string;
  sector?: string;
  language?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  image?: { mimeType?: string; base64?: string; name?: string };
  document?: { name?: string; mimeType?: string; text?: string };
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

  const provider = pickWithClaude();
  if (!provider) {
    return Response.json({ error: missingLlmMessage() }, { status: 500 });
  }

  const access = await resolveLlmAccess(request);
  const quota = checkAndConsumeQuota(quotaKeyFromRequest(request), "chat", {
    paid: access.paid,
  });
  if (!quota.ok) return quotaExceededResponse(quota);

  const body = (await request.json().catch(() => null)) as ChatBody | null;
  const imageBase64 = body?.image?.base64?.replace(/\s/g, "").trim();
  const imageMimeRaw = body?.image?.mimeType?.trim() || "image/jpeg";
  const imageName = body?.image?.name?.trim();
  const imageMime = normalizeImageMime(imageMimeRaw, imageName);
  const hasImage = Boolean(imageBase64 && imageBase64.length > 32);
  const docText = body?.document?.text?.replace(/\0/g, "").trim() || "";
  const docName = body?.document?.name?.trim() || "document.txt";
  const hasDocument = docText.length > 0;
  const message =
    body?.message?.trim() ||
    (hasImage
      ? "Décris cette image clairement et dis ce qui est utile."
      : hasDocument
        ? "Analyse ce document : résumé, points clés, risques ou prochaines actions."
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
  if (body?.document && !hasDocument) {
    return Response.json(
      { error: "Document vide ou illisible." },
      { status: 400 },
    );
  }

  const sector = body?.sector?.trim();
  const language = body?.language?.trim() || "auto";
  const lane: OkapiAgentLane =
    body?.lane === "creer" ? "creer" : "conseil";
  // Conseiller → Pro si payant. Gratuit / invité = Flash seulement (budget Opus).
  const engine = resolveEngineForPlan(
    lane === "conseil" ? "pro" : body?.engine,
    access.paid,
  );
  // Gouverneurs seulement : réponse figée (DB) — jamais le LLM pour inventer un nom.
  // Ministres / maires / actu → LLM + research grounding (pas de refus « gouverneur »).
  const liveFact = wantsLiveCurrentFact(message);
  let verifiedDirect: string | null = null;
  if (liveFact) {
    const packet = await resolveLiveOfficeFact(message);
    if (packet) {
      verifiedDirect =
        formatVerifiedOfficeAnswer(packet) ??
        formatUnverifiedOfficeAnswer(message);
    }
  }

  if (verifiedDirect) {
    return new Response(verifiedDirect, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Okapi-Provider": "okapi",
        "X-Okapi-Fact": "verified",
      },
    });
  }

  // Calendrier : SVG programmé (dates exactes) — pas le LLM (grilles texte souvent fausses).
  const historyEarly = Array.isArray(body?.history)
    ? body.history.slice(-16)
    : [];
  if (
    !hasImage &&
    !hasDocument &&
    shouldServeCalendar(message, historyEarly)
  ) {
    return new Response(formatCalendarAnswer(message, historyEarly), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Okapi-Provider": "okapi",
        "X-Okapi-Calendar": "1",
      },
    });
  }

  let researchBlock = "";
  if (
    lane === "conseil" &&
    !hasImage &&
    !hasDocument &&
    !wantsMathDiagram(message)
  ) {
    const research = await resolveResearchGrounding(message);
    if (research) {
      researchBlock = researchGroundingSystemBlock(research, language);
    }
  }

  let memoryBlock = "";
  try {
    const session = await getUserFromAuthHeader(request);
    if (session) {
      const memory = await loadUserIntelligenceContext(
        session.supabase,
        session.user.id,
        session.user,
      );
      memoryBlock = intelligenceSystemBlock(memory);
    }
  } catch {
    // Invité — chat reste ouvert sans mémoire projets
  }

  const diagramBlock =
    !hasImage && wantsMathDiagram(message) ? diagramSystemBlock(message) : "";

  const system =
    buildSystem(language, Boolean(body?.debug), lane) +
    (hasImage
      ? `\n\nVISION: An image is attached — you can see it. Describe accurately in the user’s language. If something is unclear, blurry, or illegible, say so — do not invent text or details.`
      : "") +
    (hasDocument
      ? `\n\nDOCUMENT ATTACHED (« ${docName} »): analyse the user message against this document text. Do not invent content absent from it.`
      : "") +
    diagramBlock +
    researchBlock +
    memoryBlock +
    okapiTurnBrief(message, historyEarly.length);
  const history = Array.isArray(body?.history) ? body.history.slice(-16) : [];
  const docBlock = hasDocument
    ? `\n\n--- DOCUMENT: ${docName} ---\n${docText.slice(0, 80_000)}\n--- FIN DOCUMENT ---`
    : "";
  const userContent = sector
    ? lane === "creer"
      ? `[Builder context (optional): ${sector}]\n\n${message}${docBlock}`
      : `[Contexte métier (optionnel): ${sector}]\n\n${message}${docBlock}`
    : `${message}${docBlock}`;
  const image: ImagePart | null = hasImage
    ? { mimeType: imageMime, base64: imageBase64! }
    : null;

  // Basse temp = moins d’invention (faits, maths, docs). Créateur un peu plus libre.
  // Opus 5.5 ignore/refuse temperature — l’effort de raisonnement est le vrai levier.
  const needsStrict =
    lane === "conseil" ||
    Boolean(researchBlock) ||
    Boolean(diagramBlock) ||
    hasDocument ||
    /\b(calcule|calcul|combien|%\s|pour\s*cent|étape par étape|verifie)\b/i.test(
      message,
    );
  const temperature = needsStrict ? 0.15 : lane === "creer" ? 0.4 : 0.35;
  const deepTurn = turnNeedsDeepReasoning(message, historyEarly.length);
  const reasoningEffort = resolveChatReasoningEffort({
    engine,
    message,
    hard: needsStrict || deepTurn || Boolean(researchBlock) || hasDocument,
  });

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
      reasoningEffort,
    );
  }
  if (provider === "gemini") {
    return streamGemini(userContent, history, image, system);
  }
  return streamClaude(
    userContent,
    history,
    image,
    system,
    Boolean(researchBlock) || needsStrict ? 12_000 : 8_192,
  );
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
  reasoningEffort?: OkapiReasoningEffort,
) {
  try {
    return await streamOpenRouterChat({
      system,
      engine,
      messages: toOpenRouterMessages(userContent, history, image),
      vision: Boolean(image),
      temperature,
      reasoningEffort,
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
  maxTokens = 8_192,
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
    model: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5",
    max_tokens: maxTokens,
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
