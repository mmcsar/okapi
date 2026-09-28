/**
 * Vidéo Okapi via HeyGen Video Agent (v3).
 * La clé reste serveur — jamais renvoyée au client.
 */

const HEYGEN_BASE = "https://api.heygen.com";

export function heygenConfigured() {
  return Boolean(process.env.HEYGEN_API_KEY?.trim());
}

export type HeygenVideoState = {
  sessionId: string | null;
  videoId: string | null;
  status: string;
  progress: number | null;
  videoUrl: string | null;
  error: string | null;
};

function unwrap(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  if (root.data && typeof root.data === "object") {
    return root.data as Record<string, unknown>;
  }
  return root;
}

function str(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function heygen(path: string, init?: RequestInit) {
  const key = process.env.HEYGEN_API_KEY?.trim() || "";
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "X-Api-Key": key,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as unknown;
  return { ok: res.ok, status: res.status, json };
}

function publicFailure(json: unknown, fallback: string) {
  const data = unwrap(json);
  const root = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const message =
    str(data?.failure_message) ||
    str(data?.error) ||
    str(root?.error) ||
    str(root?.message) ||
    fallback;
  return message.slice(0, 240);
}

function stateFrom(data: Record<string, unknown> | null, fallbackStatus: string): HeygenVideoState {
  return {
    sessionId: str(data?.session_id),
    videoId: str(data?.video_id) || str(data?.id),
    status: str(data?.status) || fallbackStatus,
    progress: num(data?.progress),
    videoUrl:
      str(data?.video_url) ||
      str(data?.url) ||
      str(data?.videoUrl),
    error: str(data?.failure_message) || str(data?.failure_code),
  };
}

export function isSafeHeygenId(id: string) {
  return /^[a-zA-Z0-9_-]{6,80}$/.test(id);
}

/** Démarre une session Video Agent (une vidéo, sans dialogue). */
export async function startHeygenVideo(prompt: string): Promise<HeygenVideoState> {
  const { ok, status, json } = await heygen("/v3/video-agents", {
    method: "POST",
    body: JSON.stringify({
      prompt: prompt.slice(0, 2000),
      mode: "generate",
    }),
  });
  if (!ok) {
    throw new Error(publicFailure(json, `Vidéo refusée (${status}).`));
  }
  const data = unwrap(json);
  const state = stateFrom(data, "thinking");
  if (!state.sessionId) {
    throw new Error("La vidéo n’a pas démarré.");
  }
  return state;
}

export async function getHeygenSession(sessionId: string): Promise<HeygenVideoState> {
  const { ok, status, json } = await heygen(
    `/v3/video-agents/${encodeURIComponent(sessionId)}`,
  );
  if (!ok) {
    throw new Error(publicFailure(json, `Suivi vidéo impossible (${status}).`));
  }
  const state = stateFrom(unwrap(json), "thinking");
  state.sessionId = state.sessionId || sessionId;
  return state;
}

export async function getHeygenVideo(videoId: string): Promise<HeygenVideoState> {
  const { ok, status, json } = await heygen(
    `/v3/videos/${encodeURIComponent(videoId)}`,
  );
  if (!ok) {
    throw new Error(publicFailure(json, `Lecture vidéo impossible (${status}).`));
  }
  const state = stateFrom(unwrap(json), "processing");
  state.videoId = state.videoId || videoId;
  return state;
}
