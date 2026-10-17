/** Mémoire locale de la session Okapi : événements du chat + artifact en cours. */

const KEY = "okapi-session-memory-v1";
const MAX_EVENTS = 16;
const MAX_TURN = 700;
const MAX_NOTE = 900;
const MAX_JSON = 1_400_000;

export type SessionTurn = {
  role: "user" | "assistant";
  text: string;
};

export type SessionArtifact = {
  title: string;
  sector: string;
  files: string[];
  note: string;
  html?: string;
  react?: string;
  reactNative?: string;
  nextjs?: string;
  packageJson?: string;
  sql?: string;
  api?: string;
  python?: string;
  requirements?: string;
  flutter?: string;
  pubspec?: string;
  readme?: string;
};

export type SessionMemory = {
  v: 1;
  savedAt: number;
  events: SessionTurn[];
  artifact: SessionArtifact | null;
};

function clip(value: string | null | undefined, max: number) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function readSessionMemory(): SessionMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionMemory;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSessionMemory(input: {
  events: SessionTurn[];
  artifact: SessionArtifact | null;
}) {
  if (typeof window === "undefined") return;
  const events = input.events
    .filter((event) => event.text.trim())
    .slice(-MAX_EVENTS)
    .map((event) => ({
      role: event.role,
      text: event.text.slice(0, MAX_TURN),
    }));
  let artifact = input.artifact;
  let payload: SessionMemory = {
    v: 1,
    savedAt: Date.now(),
    events,
    artifact,
  };
  try {
    let raw = JSON.stringify(payload);
    if (raw.length > MAX_JSON && artifact) {
      artifact = {
        ...artifact,
        react: undefined,
        reactNative: undefined,
        nextjs: undefined,
        python: undefined,
        flutter: undefined,
        api: undefined,
      };
      payload = { ...payload, artifact };
      raw = JSON.stringify(payload);
    }
    if (raw.length > MAX_JSON && artifact) {
      artifact = {
        title: artifact.title,
        sector: artifact.sector,
        files: artifact.files,
        note: artifact.note,
        html: artifact.html?.slice(0, 80_000),
        sql: artifact.sql?.slice(0, 20_000),
        readme: artifact.readme?.slice(0, 8_000),
      };
      payload = { ...payload, artifact };
      raw = JSON.stringify(payload);
    }
    window.localStorage.setItem(KEY, raw);
  } catch {
    /* quota / private mode */
  }
}

export function clearSessionMemory() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function visibleHtmlHint(html: string | null | undefined) {
  return clip(
    (html ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
    MAX_NOTE,
  );
}

/** Bloc court injecté au chat. L’artifact existe dès qu’un fichier est listé. */
export function formatSessionRecall(input: {
  events: SessionTurn[];
  artifact: Pick<SessionArtifact, "title" | "sector" | "files" | "note"> | null;
}) {
  const lines: string[] = [];
  if (input.artifact && input.artifact.files.length) {
    lines.push(
      `ARTIFACT EN COURS (déjà créé, il existe) : « ${input.artifact.title || "Projet Okapi"} » · ${input.artifact.sector || "Général"} · fichiers : ${input.artifact.files.join(", ")}.`,
    );
    if (input.artifact.note) {
      lines.push(`Extrait : ${input.artifact.note}`);
    }
  }
  const events = input.events
    .filter((event) => event.text.trim())
    .slice(-8);
  if (events.length) {
    lines.push("ÉVÉNEMENTS PRÉCÉDENTS :");
    for (const event of events) {
      const who = event.role === "user" ? "Demande" : "Okapi";
      lines.push(`- ${who} : ${clip(event.text, 280)}`);
    }
  }
  if (!lines.length) return "";
  return [
    "RAPPEL SESSION",
    ...lines,
    "Règle : si des fichiers sont listés, l’artifact est là. Une suite (« modifie », « l’artifact », « le projet », « ça ») porte sur cet artifact. Ne dis pas qu’il manque.",
  ].join("\n");
}
