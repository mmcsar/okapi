/** Typed NDJSON events for POST /api/generate?stream=1 */

export type GenerateStreamStatus = {
  type: "status";
  message: string;
  mode?: string;
  debug?: boolean;
  large?: boolean;
  engine?: string;
};

export type GenerateStreamDelta = {
  type: "delta";
  text: string;
};

export type GenerateStreamDone = {
  type: "done";
  html: string;
  react?: string | null;
  reactNative?: string | null;
  nextjs?: string | null;
  sql?: string | null;
  api?: string | null;
  readme?: string | null;
  title: string;
  summary?: string;
  mode?: string;
  debug?: boolean;
  large?: boolean;
  engine?: string;
};

export type GenerateStreamError = {
  type: "error";
  error: string;
  preview?: string;
};

export type GenerateStreamEvent =
  | GenerateStreamStatus
  | GenerateStreamDelta
  | GenerateStreamDone
  | GenerateStreamError;

export function encodeGenerateStreamEvent(event: GenerateStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parseGenerateStreamLine(line: string): GenerateStreamEvent {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error("Événement generate vide.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    throw new Error(
      "Réponse Okapi interrompue. Réessaie dans quelques secondes.",
    );
  }
  if (!raw || typeof raw !== "object" || !("type" in raw)) {
    throw new Error("Réponse Okapi invalide.");
  }
  const type = (raw as { type: unknown }).type;
  if (
    type !== "status" &&
    type !== "delta" &&
    type !== "done" &&
    type !== "error"
  ) {
    throw new Error(`Événement generate inconnu: ${String(type)}`);
  }
  return raw as GenerateStreamEvent;
}
