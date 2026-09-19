/** NDJSON events for Studio project / edit streaming. */

import type { StudioFileId } from "@/lib/studio-files";

export type StudioStreamStatus = {
  type: "status";
  message: string;
  step?: number;
  total?: number;
  large?: boolean;
  engine?: string;
  repairing?: boolean;
};

/** Live token / text chunk — Agent shows code evolving (Cursor-like). */
export type StudioStreamDelta = {
  type: "delta";
  text: string;
};

/** A file finished parsing (optional progressive apply). */
export type StudioStreamFile = {
  type: "file";
  fileId: StudioFileId;
  content: string;
};

export type StudioStreamDone = {
  type: "done";
  title?: string;
  note: string;
  large?: boolean;
  repaired?: boolean;
  multi?: boolean;
  files: { fileId: StudioFileId; content: string }[];
  qualityIssues?: string[];
};

export type StudioStreamError = {
  type: "error";
  error: string;
};

export type StudioStreamEvent =
  | StudioStreamStatus
  | StudioStreamDelta
  | StudioStreamFile
  | StudioStreamDone
  | StudioStreamError;

export function encodeStudioStreamEvent(event: StudioStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parseStudioStreamLine(line: string): StudioStreamEvent {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error("Événement Studio vide.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    throw new Error(
      "Réponse Studio interrompue. Réessaie dans quelques secondes.",
    );
  }
  if (!raw || typeof raw !== "object" || !("type" in raw)) {
    throw new Error("Réponse Studio invalide.");
  }
  const type = (raw as { type: unknown }).type;
  if (
    type !== "status" &&
    type !== "delta" &&
    type !== "file" &&
    type !== "done" &&
    type !== "error"
  ) {
    throw new Error(`Événement Studio inconnu: ${String(type)}`);
  }
  return raw as StudioStreamEvent;
}

/** Consume NDJSON Studio stream; call onEvent for each line. */
export async function readStudioStream(
  res: Response,
  onEvent: (event: StudioStreamEvent) => void,
): Promise<StudioStreamDone> {
  if (!res.body) {
    throw new Error("Flux Studio indisponible.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEvent: StudioStreamDone | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parseStudioStreamLine(line);
      onEvent(event);
      if (event.type === "error") {
        throw new Error(event.error);
      }
      if (event.type === "done") {
        doneEvent = event;
      }
    }
  }

  if (buffer.trim()) {
    const event = parseStudioStreamLine(buffer);
    onEvent(event);
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "done") doneEvent = event;
  }

  if (!doneEvent) {
    throw new Error("Studio n’a pas terminé la génération.");
  }
  return doneEvent;
}
