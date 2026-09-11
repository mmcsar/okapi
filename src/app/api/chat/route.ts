import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { languageInstruction } from "@/lib/i18n";
import { friendlyLlmError, isLocationBlocked } from "@/lib/llm-errors";
import { missingLlmMessage, pickLlmProvider } from "@/lib/llm-provider";
import { openAiConfigured, streamOpenAiChat } from "@/lib/openai";
import {
  openRouterConfigured,
  streamOpenRouterChat,
} from "@/lib/openrouter";

export const runtime = "nodejs";

function buildSystem(language?: string | null) {
  return `You are Okapi, a single autonomous AI agent (like ChatGPT / Claude / Gemini).

Core rule: act ONLY on request. Do what is necessary, nothing more.
- Question → answer clearly, no useless digressions.
- Ask to build/modify an app or site → concrete help (plan, tips). Live HTML generation is handled by Okapi builder.
- Do not spontaneously pitch apps, templates, or marketing menus.

${languageInstruction(language)}

Style: clear, concise, useful. You can be wrong — invite verification.
You are not a doctor or lawyer.`;
}

type ChatBody = {
  message?: string;
  sector?: string;
  language?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  image?: { mimeType?: string; base64?: string; name?: string };
};

type ImagePart = { mimeType: string; base64: string };

export async function POST(request: Request) {
  const provider = pickLlmProvider();
  if (!provider) {
    return Response.json({ error: missingLlmMessage() }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as ChatBody | null;
  const imageBase64 = body?.image?.base64?.trim();
  const imageMime = body?.image?.mimeType?.trim() || "image/jpeg";
  const hasImage = Boolean(imageBase64);
  const message =
    body?.message?.trim() ||
    (hasImage ? "Describe this image and tell me what is useful." : "");
  if (!message) {
    return Response.json({ error: "Message vide." }, { status: 400 });
  }

  const sector = body?.sector?.trim();
  const language = body?.language?.trim() || "auto";
  const system = buildSystem(language);
  const history = Array.isArray(body?.history) ? body.history.slice(-16) : [];
  const userContent = sector
    ? `[Builder context (optional): ${sector}]\n\n${message}`
    : message;
  const image: ImagePart | null = hasImage
    ? { mimeType: imageMime, base64: imageBase64! }
    : null;

  if (provider === "openai") {
    return streamViaOpenAi(userContent, history, image, system);
  }
  if (provider === "openrouter") {
    return streamViaOpenRouter(userContent, history, image, system);
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
) {
  try {
    return await streamOpenAiChat({
      system,
      messages: toOpenRouterMessages(userContent, history, image),
    });
  } catch (err) {
    return new Response(`\n\n[Erreur Okapi] ${friendlyLlmError(err)}`, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Okapi-Provider": "openai",
      },
    });
  }
}

async function streamViaOpenRouter(
  userContent: string,
  history: { role: "user" | "assistant"; content: string }[],
  image: ImagePart | null,
  system: string,
) {
  try {
    return await streamOpenRouterChat({
      system,
      messages: toOpenRouterMessages(userContent, history, image),
    });
  } catch (err) {
    return new Response(
      `\n\n[Erreur Okapi] ${friendlyLlmError(err)}`,
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Okapi-Provider": "openrouter",
        },
      },
    );
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
            const via = openAiConfigured() ? "OpenAI" : "OpenRouter";
            controller.enqueue(
              encoder.encode(
                `(Gemini bloqué dans ta région — bascule ${via}…)\n\n`,
              ),
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
              const via = openAiConfigured() ? "OpenAI" : "OpenRouter";
              controller.enqueue(
                encoder.encode(
                  `(Gemini bloqué dans ta région — bascule ${via}…)\n\n`,
                ),
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
                encoder.encode(`\n\n[Erreur Okapi] ${friendlyLlmError(err)}`),
              );
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(`\n\n[Erreur Okapi] ${friendlyLlmError(err)}`),
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Okapi-Provider": "gemini",
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
          encoder.encode(`\n\n[Erreur Okapi] ${friendlyLlmError(err)}`),
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Okapi-Provider": "claude",
    },
  });
}
