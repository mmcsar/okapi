"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { UserMenu } from "@/components/user-menu";
import { useOkapiAudio } from "@/hooks/use-okapi-audio";
import {
  downloadDataUrl,
  fileToAttachedImage,
  type AttachedImage,
} from "@/lib/image";
import { downloadTextFile, downloadProjectZip, slugifyFilename } from "@/lib/export";
import {
  getStoredLanguage,
  speechLocaleFor,
  type OkapiLangCode,
} from "@/lib/i18n";
import { wantsAppBuild, wantsDebug } from "@/lib/intent";
import { resolveGenerateMode, wantsLargeProject } from "@/lib/fullstack";
import {
  getStoredEngine,
  OKAPI_ENGINES,
  setStoredEngine,
  type OkapiEngine,
} from "@/lib/okapi-engine";
import type { OkapiProject } from "@/lib/supabase";
import type { OkapiArtifacts } from "@/lib/project-artifacts";
import { WorkspacePanel } from "@/components/workspace-panel";
import type { StudioFileId } from "@/components/okapi-studio";

type HomeDashboardProps = {
  section: string;
  resetKey?: number;
  initialProject?: OkapiProject | null;
  onGoHome?: () => void;
  onNavigate?: (id: string) => void;
};

function greetingFromHour(hour: number) {
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

export function HomeDashboard({
  section,
  resetKey = 0,
  initialProject = null,
  onGoHome,
  onNavigate,
}: HomeDashboardProps) {
  const { user, displayName, authFetch, signOut } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [sector, setSector] = useState<string>("Général");
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string; imageUrl?: string }[]
  >([]);
  const [sending, setSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewReact, setPreviewReact] = useState<string | null>(null);
  const [previewReactNative, setPreviewReactNative] = useState<string | null>(
    null,
  );
  const [previewNext, setPreviewNext] = useState<string | null>(null);
  const [previewSql, setPreviewSql] = useState<string | null>(null);
  const [previewApi, setPreviewApi] = useState<string | null>(null);
  const [previewPython, setPreviewPython] = useState<string | null>(null);
  const [previewFlutter, setPreviewFlutter] = useState<string | null>(null);
  const [previewReadme, setPreviewReadme] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("Preview");
  const [workspaceFocusKey, setWorkspaceFocusKey] = useState(0);
  const [debugArmed, setDebugArmed] = useState(false);
  const [engine, setEngine] = useState<OkapiEngine>("flash");
  const [engineOpen, setEngineOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  // Stable on SSR + first paint to avoid hydration mismatch (Date differs server/client).
  const [greeting, setGreeting] = useState("Bonjour");
  const [voiceOut, setVoiceOut] = useState(false);
  const [draftVoice, setDraftVoice] = useState("");
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [language, setLanguage] = useState<OkapiLangCode>("auto");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const projectIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const snapRef = useRef({
    html: null as string | null,
    react: null as string | null,
    reactNative: null as string | null,
    nextjs: null as string | null,
    sql: null as string | null,
    api: null as string | null,
    python: null as string | null,
    flutter: null as string | null,
    readme: null as string | null,
    title: "Preview",
    sector: "Général",
  });

  useEffect(() => {
    snapRef.current = {
      html: previewHtml,
      react: previewReact,
      reactNative: previewReactNative,
      nextjs: previewNext,
      sql: previewSql,
      api: previewApi,
      python: previewPython,
      flutter: previewFlutter,
      readme: previewReadme,
      title: previewTitle,
      sector,
    };
  }, [
    previewHtml,
    previewReact,
    previewReactNative,
    previewNext,
    previewSql,
    previewApi,
    previewPython,
    previewFlutter,
    previewReadme,
    previewTitle,
    sector,
  ]);

  const onTranscript = useCallback((text: string, isFinal: boolean) => {
    const clean = text.trim();
    if (!clean) return;
    if (isFinal) {
      setPrompt((prev) => {
        const base = prev.trim();
        return base ? `${base} ${clean}` : clean;
      });
      setDraftVoice("");
    } else {
      setDraftVoice(clean);
    }
  }, []);

  const speechLocale =
    language === "auto" ? "fr-FR" : speechLocaleFor(language);
  const audio = useOkapiAudio(onTranscript, speechLocale);
  const {
    listening,
    speaking,
    supportedListen,
    supportedSpeak,
    audioError,
    toggleListen,
    stopListen,
    stopSpeak,
    toggleSpeak,
    speak,
  } = audio;
  const voiceOutRef = useRef(voiceOut);
  voiceOutRef.current = voiceOut;

  useEffect(() => {
    const sync = () => setLanguage(getStoredLanguage());
    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    setEngine(getStoredEngine());
  }, []);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    setGreeting(greetingFromHour(new Date().getHours()));
  }, []);

  useEffect(() => {
    setPrompt("");
    setStatus(null);
    setSending(false);
    setDraftVoice("");
    setAttachedImage(null);
    setShareUrl(null);
    stopListen();
    stopSpeak();
    setMessages([]);
    if (initialProject) {
      setSector(initialProject.sector || "Général");
      setPreviewHtml(initialProject.html || null);
      setPreviewReact(initialProject.artifacts?.react ?? null);
      setPreviewReactNative(initialProject.artifacts?.reactNative ?? null);
      setPreviewNext(initialProject.artifacts?.nextjs ?? null);
      setPreviewSql(
        initialProject.artifacts?.sql ??
          initialProject.backend_sql ??
          null,
      );
      setPreviewApi(
        initialProject.artifacts?.api ??
          initialProject.backend_api ??
          null,
      );
      setPreviewPython(initialProject.artifacts?.python ?? null);
      setPreviewFlutter(initialProject.artifacts?.flutter ?? null);
      setPreviewReadme(
        initialProject.artifacts?.readme ??
          initialProject.backend_readme ??
          null,
      );
      setPreviewTitle(initialProject.title || "Preview");
      setCloudStatus("Cloud · projet ouvert");
      setProjectId(initialProject.id);
      projectIdRef.current = initialProject.id;
      setShareUrl(
        initialProject.is_public && initialProject.share_slug
          ? `/p/${initialProject.share_slug}`
          : null,
      );
      setMessages([
        {
          role: "assistant",
          content: `Projet ouvert : ${initialProject.title}. Dis-moi ce dont tu as besoin.`,
        },
      ]);
    } else {
      setSector("Général");
      setPreviewHtml(null);
      setPreviewReact(null);
      setPreviewReactNative(null);
      setPreviewNext(null);
      setPreviewSql(null);
      setPreviewApi(null);
      setPreviewPython(null);
      setPreviewFlutter(null);
      setPreviewReadme(null);
      setPreviewTitle("Preview");
      setProjectId(null);
      projectIdRef.current = null;
    }
  }, [resetKey, initialProject, stopListen, stopSpeak]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const isHome = section === "dashboard";
  const split =
    Boolean(
      previewHtml ||
        previewReact ||
        previewReactNative ||
        previewNext ||
        previewSql ||
        previewApi ||
        previewPython ||
        previewFlutter ||
        previewReadme,
    ) || sending;

  async function persistProject(payload: {
    title: string;
    sector: string;
    html: string;
    summary?: string;
    artifacts?: OkapiArtifacts;
  }) {
    if (!user) {
      return "Connecte-toi pour sauvegarder en cloud (menu Connexion).";
    }

    try {
      const snap = snapRef.current;
      const artifacts: OkapiArtifacts = {
        react: snap.react,
        reactNative: snap.reactNative,
        nextjs: snap.nextjs,
        sql: snap.sql,
        api: snap.api,
        python: snap.python,
        flutter: snap.flutter,
        readme: snap.readme,
        ...payload.artifacts,
      };

      const body = {
        title: payload.title,
        sector: payload.sector,
        html: payload.html,
        summary: payload.summary,
        artifacts,
        sql: artifacts.sql ?? undefined,
        api: artifacts.api ?? undefined,
        readme: artifacts.readme ?? undefined,
      };

      const currentId = projectIdRef.current;
      if (currentId) {
        const res = await authFetch(`/api/projects/${currentId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { error?: string; project?: OkapiProject };
        if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
        return null;
      }

      const res = await authFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; project?: OkapiProject };
      if (!res.ok || !data.project) {
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      setProjectId(data.project.id);
      projectIdRef.current = data.project.id;
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Sauvegarde impossible";
    }
  }

  function applyStudioCommit(fileId: StudioFileId, content: string) {
    const key =
      fileId === "app.html"
        ? "html"
        : fileId === "App.tsx"
          ? "react"
          : fileId === "App.native.tsx"
            ? "reactNative"
            : fileId === "app/page.tsx"
              ? "nextjs"
              : fileId === "schema.sql"
                ? "sql"
                : fileId === "api.ts"
                  ? "api"
                  : fileId === "main.py"
                    ? "python"
                    : fileId === "main.dart"
                      ? "flutter"
                      : "readme";
    snapRef.current = { ...snapRef.current, [key]: content || null };
    void saveCloudNow({ silent: true });
  }

  async function saveCloudNow(opts?: { silent?: boolean }) {
    const snap = snapRef.current;
    if (
      !snap.html &&
      !snap.react &&
      !snap.nextjs &&
      !snap.sql &&
      !snap.api &&
      !snap.python &&
      !snap.flutter &&
      !snap.readme
    ) {
      if (!opts?.silent) {
        setStatus("Rien à sauvegarder — génère ou édite d’abord.");
      }
      return;
    }
    if (!user) {
      setCloudStatus("Connexion requise");
      if (!opts?.silent) {
        setStatus("Connecte-toi pour sauvegarder en cloud.");
        onNavigate?.("login");
      }
      return;
    }
    setSaveBusy(true);
    setCloudStatus("Sauvegarde…");
    const err = await persistProject({
      title: snap.title || "Projet Okapi",
      sector: snap.sector,
      html: snap.html || "",
      summary: "Sauvegarde Studio Okapi",
      artifacts: {
        react: snap.react,
        reactNative: snap.reactNative,
        nextjs: snap.nextjs,
        sql: snap.sql,
        api: snap.api,
        python: snap.python,
        flutter: snap.flutter,
        readme: snap.readme,
      },
    });
    setSaveBusy(false);
    if (err) {
      setCloudStatus("Échec cloud");
      if (!opts?.silent) setStatus(err);
      return;
    }
    setCloudStatus("Cloud · à jour");
    if (!opts?.silent) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Projet sauvegardé sur ton compte Okapi (tous les fichiers Studio).",
        },
      ]);
    }
  }

  async function onPickImage(file: File | null) {
    if (!file) return;
    try {
      const img = await fileToAttachedImage(file);
      setAttachedImage(img);
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Image invalide");
    }
  }

  function exportHtml() {
    if (!previewHtml) return;
    downloadTextFile(
      previewHtml,
      `${slugifyFilename(previewTitle)}.html`,
    );
    setStatus(null);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `HTML téléchargé : ${slugifyFilename(previewTitle)}.html`,
      },
    ]);
  }

  function exportSql() {
    if (!previewSql) return;
    downloadTextFile(
      previewSql,
      `${slugifyFilename(previewTitle)}-schema.sql`,
    );
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Schéma base téléchargé : ${slugifyFilename(previewTitle)}-schema.sql`,
      },
    ]);
  }

  function exportApi() {
    if (!previewApi) return;
    downloadTextFile(
      previewApi,
      `${slugifyFilename(previewTitle)}-api.ts`,
    );
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Routes API téléchargées : ${slugifyFilename(previewTitle)}-api.ts`,
      },
    ]);
  }

  function exportReadme() {
    if (!previewReadme) return;
    downloadTextFile(
      previewReadme,
      `${slugifyFilename(previewTitle)}-README.md`,
    );
  }

  function exportZip() {
    const slug = slugifyFilename(previewTitle);
    const ok = downloadProjectZip(
      [
        { path: "app.html", content: previewHtml || "" },
        { path: "App.tsx", content: previewReact || "" },
        { path: "App.native.tsx", content: previewReactNative || "" },
        { path: "app/page.tsx", content: previewNext || "" },
        { path: "schema.sql", content: previewSql || "" },
        { path: "api.ts", content: previewApi || "" },
        { path: "main.py", content: previewPython || "" },
        { path: "main.dart", content: previewFlutter || "" },
        { path: "README.md", content: previewReadme || "" },
      ],
      `${slug}-okapi`,
    );
    if (!ok) {
      setStatus("Rien à exporter — génère ou édite d’abord des fichiers.");
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `ZIP téléchargé : ${slug}-okapi.zip`,
      },
    ]);
  }

  function onChangeArtifact(id: StudioFileId, value: string) {
    if (id === "app.html") setPreviewHtml(value || null);
    else if (id === "App.tsx") setPreviewReact(value || null);
    else if (id === "App.native.tsx") setPreviewReactNative(value || null);
    else if (id === "app/page.tsx") setPreviewNext(value || null);
    else if (id === "schema.sql") setPreviewSql(value || null);
    else if (id === "api.ts") setPreviewApi(value || null);
    else if (id === "main.py") setPreviewPython(value || null);
    else if (id === "main.dart") setPreviewFlutter(value || null);
    else if (id === "README.md") setPreviewReadme(value || null);
  }

  async function shareProject() {
    if (!previewHtml) return;
    if (!user) {
      setStatus("Connecte-toi pour partager un lien public.");
      onNavigate?.("login");
      return;
    }

    setShareBusy(true);
    setStatus(null);
    try {
      let id = projectIdRef.current;
      if (!id) {
        const err = await persistProject({
          title: previewTitle || "Projet Okapi",
          sector,
          html: previewHtml,
          summary: "Partage public Okapi",
        });
        if (err) throw new Error(err);
        id = projectIdRef.current;
      }
      if (!id) throw new Error("Projet non sauvegardé.");

      const res = await authFetch(`/api/projects/${id}/share`, {
        method: "POST",
        body: JSON.stringify({ enabled: true }),
      });
      const data = (await res.json()) as {
        error?: string;
        url?: string;
        project?: OkapiProject;
      };
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);

      const path = data.url || (data.project?.share_slug ? `/p/${data.project.share_slug}` : null);
      if (!path) throw new Error("Lien non généré.");
      const absolute = `${window.location.origin}${path}`;
      setShareUrl(path);
      try {
        await navigator.clipboard.writeText(absolute);
      } catch {
        /* ignore */
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Lien public prêt (copié) : ${absolute}`,
        },
      ]);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Partage impossible");
    } finally {
      setShareBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if ((!trimmed && !attachedImage) || sending) {
      if (!trimmed && !attachedImage) {
        setStatus("Écris ta demande ou ajoute une image.");
      }
      return;
    }

    const imagePayload = attachedImage;
    // Avec une image, on passe par l'agent vision (chat), pas le builder HTML.
    const activeLang = getStoredLanguage();
    setLanguage(activeLang);
    const largeAsk = !imagePayload && wantsLargeProject(trimmed);
    const debug =
      debugArmed || (!imagePayload && wantsDebug(trimmed));
    const build =
      !imagePayload &&
      (wantsAppBuild(trimmed, Boolean(previewHtml)) ||
        (debug && Boolean(previewHtml)));
    const mode = build
      ? resolveGenerateMode(
          trimmed,
          previewSql || previewApi || largeAsk ? "fullstack" : "auto",
        )
      : null;
    const historyForChat = messages
      .filter((m) => m.content?.trim())
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    const started = Date.now();
    stopListen();
    stopSpeak();
    setDraftVoice("");
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content:
          trimmed ||
          (imagePayload ? `Image : ${imagePayload.name}` : ""),
        imageUrl: imagePayload?.dataUrl,
      },
      {
        role: "assistant",
        content: build
          ? debug
            ? "Okapi debug… correction en cours…"
            : largeAsk
              ? engine === "pro"
                ? "Okapi Pro — grand projet en cours…"
                : "Okapi Flash — grand projet en cours…"
              : mode === "fullstack"
                ? previewHtml
                  ? "Mise à jour fullstack (UI + base)…"
                  : "Génération fullstack (UI + base)…"
                : previewHtml
                  ? "Mise à jour de la preview…"
                  : "Génération de la preview…"
          : debug
            ? "Okapi analyse le bug…"
            : "Okapi réfléchit…",
      },
    ]);
    setPrompt("");
    setAttachedImage(null);
    setDebugArmed(false);
    setStatus(null);
    setSending(true);

    const setAssistant = (content: string) => {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content };
        return next;
      });
    };

    try {
      if (!build) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message:
              trimmed ||
              "Describe this image and tell me what is useful.",
            sector,
            language: activeLang,
            history: historyForChat,
            debug,
            engine,
            image: imagePayload
              ? {
                  mimeType: imagePayload.mimeType,
                  base64: imagePayload.base64,
                  name: imagePayload.name,
                }
              : undefined,
          }),
        });

        if (!res.ok || !res.body) {
          const fail = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(fail?.error ?? `Erreur ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          // Garde-fou : snapshot cumulatif reçu tel quel
          if (answer && chunk.startsWith(answer)) {
            answer = chunk;
          } else if (!(answer && answer.endsWith(chunk))) {
            answer += chunk;
          }
          setAssistant(answer || "…");
        }

        if (!answer.trim()) {
          throw new Error("Réponse vide.");
        }
        let finalAnswer = answer.trim();
        // Coupe une éventuelle double copie collée bout à bout
        const half = Math.floor(finalAnswer.length / 2);
        if (
          half > 80 &&
          finalAnswer.slice(0, half).trim() === finalAnswer.slice(half).trim()
        ) {
          finalAnswer = finalAnswer.slice(0, half).trim();
        }
        if (
          /\[Erreur Okapi\]|no credits|platform\.openai|OPENAI_API_KEY|insufficient_quota|429 You/i.test(
            finalAnswer,
          )
        ) {
          finalAnswer =
            "Okapi est temporairement indisponible. Recharge la page et réessaie dans quelques minutes.";
        }
        setAssistant(finalAnswer);
        setStatus(
          /indisponible|saturé|recharge/i.test(finalAnswer)
            ? finalAnswer
            : "Prêt",
        );
        if (voiceOutRef.current) speak(finalAnswer);
        return;
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sector,
          language: activeLang,
          mode: mode ?? "auto",
          debug,
          engine,
          currentHtml: previewHtml ?? undefined,
          currentSql: previewSql ?? undefined,
          currentApi: previewApi ?? undefined,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const fail = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(fail?.error ?? `Erreur ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chars = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            message?: string;
            text?: string;
            html?: string;
            sql?: string | null;
            api?: string | null;
            readme?: string | null;
            title?: string;
            summary?: string;
            mode?: string;
            error?: string;
          };

          if (event.type === "status" && event.message) {
            setAssistant(event.message);
          } else if (event.type === "delta" && event.text) {
            chars += event.text.length;
            const sec = Math.round((Date.now() - started) / 1000);
            setAssistant(
              `Écriture… ${chars.toLocaleString("fr-FR")} car. · ${sec}s`,
            );
          } else if (event.type === "done" && event.html) {
            const sec = Math.round((Date.now() - started) / 1000);
            const title = event.title || "Preview Okapi";
            setPreviewHtml(event.html);
            if (event.sql) setPreviewSql(event.sql);
            if (event.api) setPreviewApi(event.api);
            if (event.readme) setPreviewReadme(event.readme);
            setPreviewTitle(title);
            setWorkspaceFocusKey((k) => k + 1);

            snapRef.current = {
              ...snapRef.current,
              html: event.html,
              sql: event.sql ?? snapRef.current.sql,
              api: event.api ?? snapRef.current.api,
              readme: event.readme ?? snapRef.current.readme,
              title,
              sector,
            };

            const saveNote = await persistProject({
              title,
              sector,
              html: event.html,
              summary: event.summary,
              artifacts: {
                sql: event.sql ?? null,
                api: event.api ?? null,
                readme: event.readme ?? null,
              },
            });
            if (!saveNote && user) setCloudStatus("Cloud · à jour");
            else if (saveNote) setCloudStatus("Cloud · à connecter");

            const backendBits = [
              event.sql ? "Schéma SQL" : null,
              event.api ? "API" : null,
              event.readme ? "README" : null,
            ].filter(Boolean);

            setAssistant(
              [
                event.summary ?? "Preview prête.",
                backendBits.length
                  ? `· Livrables : ${backendBits.join(" + ")}`
                  : "",
                `(${sec}s)`,
                saveNote
                  ? `· ${saveNote}`
                  : user
                    ? "· Sauvegardé cloud"
                    : "",
              ]
                .filter(Boolean)
                .join(" "),
            );
            if (voiceOutRef.current) {
              speak(event.summary ?? "Preview prête.");
            }
          } else if (event.type === "error") {
            throw new Error(event.error ?? "Erreur génération");
          }
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const soft =
        /credits|quota|429|billing|OpenAI|API_KEY|LLM_PROVIDER|limite du jour|okapi_quota/i.test(
          raw,
        ) || !raw
          ? /limite du jour|okapi_quota/i.test(raw)
            ? "Okapi a atteint la limite du jour pour ta session. Réessaie demain."
            : /très sollicité|okapi_busy|503/i.test(raw)
              ? "Okapi est très sollicité. Réessaie dans quelques secondes."
              : "Okapi est temporairement indisponible. Recharge la page et réessaie dans quelques minutes."
          : raw.replace(/^\[Erreur Okapi\]\s*/i, "").startsWith("Okapi")
            ? raw.replace(/^\[Erreur Okapi\]\s*/i, "")
            : "Okapi n’a pas pu répondre. Recharge la page et réessaie.";
      setStatus(soft);
      setAssistant(soft);
    } finally {
      setSending(false);
    }
  }

  if (!isHome) {
    return (
      <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div>
            <p className="text-sm text-okapi-ink/50">Section en préparation.</p>
            <button
              type="button"
              onClick={onGoHome}
              className="mt-4 rounded-2xl bg-okapi-forest px-5 py-2.5 text-sm font-semibold text-white"
            >
              Retour Accueil
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--okapi-stroke)] px-4 py-3.5 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-2xl ring-1 ring-[var(--okapi-stroke)]">
            <Image
              src="/okapi-logo.png"
              alt=""
              fill
              sizes="40px"
              className="object-cover object-[48%_26%]"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-[family-name:var(--font-syne)] text-base font-bold leading-none">
                {previewHtml ? previewTitle : `${greeting}, ${displayName}`}
              </p>
              {sending ? (
                <span className="hidden rounded-full bg-okapi-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-okapi-amber-deep sm:inline">
                  Génération
                </span>
              ) : previewHtml ? (
                <span className="hidden rounded-full bg-okapi-forest/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-okapi-forest sm:inline">
                  Live
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 truncate text-[11px] text-okapi-ink/45">
              {previewHtml
                ? "Agent · preview sur demande"
                : "Un agent · répond et construit sur demande"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {supportedSpeak ? (
            <button
              type="button"
              onClick={() => {
                setVoiceOut((v) => {
                  const next = !v;
                  if (!next) stopSpeak();
                  return next;
                });
              }}
              className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                voiceOut
                  ? "border-okapi-forest/30 bg-okapi-forest/10 text-okapi-forest"
                  : "border-[var(--okapi-stroke)] bg-white/80 text-okapi-ink/70 hover:bg-white"
              }`}
              title="Lire les réponses à voix haute"
            >
              {voiceOut ? "Voix on" : "Voix"}
            </button>
          ) : null}
          {split ? (
            <>
              <div className="hidden rounded-full border border-[var(--okapi-stroke)] bg-white/80 p-1 sm:flex">
                <button
                  type="button"
                  onClick={() => setDevice("mobile")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    device === "mobile"
                      ? "bg-okapi-forest text-white"
                      : "text-okapi-ink/55 hover:text-okapi-ink"
                  }`}
                >
                  Mobile
                </button>
                <button
                  type="button"
                  onClick={() => setDevice("desktop")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    device === "desktop"
                      ? "bg-okapi-forest text-white"
                      : "text-okapi-ink/55 hover:text-okapi-ink"
                  }`}
                >
                  Desktop
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewHtml(null);
                  setPreviewReact(null);
                  setPreviewReactNative(null);
                  setPreviewNext(null);
                  setPreviewSql(null);
                  setPreviewApi(null);
                  setPreviewPython(null);
                  setPreviewFlutter(null);
                  setPreviewReadme(null);
                  setDebugArmed(false);
                  setMessages([]);
                  setStatus(null);
                  stopSpeak();
                }}
                className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/80 px-3 py-2 text-xs font-semibold text-okapi-ink/70 transition hover:bg-white"
              >
                Nouveau
              </button>
            </>
          ) : null}
          <UserMenu
            onNavigate={(id) => onNavigate?.(id)}
            loggedIn={Boolean(user)}
            onAuthToggle={() => {
              if (user) void signOut();
              else onNavigate?.("login");
            }}
            userLabel={displayName}
          />
        </div>
      </header>

      <div className={`flex min-h-0 flex-1 ${split ? "flex-col lg:flex-row" : ""}`}>
        <section
          className={`relative flex min-h-0 flex-col ${
            split
              ? "lg:w-[40%] lg:border-r lg:border-[var(--okapi-stroke)]"
              : "w-full"
          }`}
        >
          <div
            className={`scrollbar-thin mx-auto flex w-full flex-1 flex-col overflow-y-auto ${
              split
                ? "max-w-xl px-4 pb-4 pt-4"
                : "max-w-3xl items-center px-4 py-10 text-center lg:px-10"
            }`}
          >
            {!split ? (
              <div className="fade-up flex w-full flex-col items-center">
                <div className="okapi-orb relative mb-6 flex h-28 w-28 items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-okapi-amber/30 blur-2xl" />
                  <span className="absolute inset-3 rounded-full bg-okapi-leaf/20 blur-lg" />
                  <span className="relative h-24 w-24 overflow-hidden rounded-full ring-[7px] ring-white/85">
                    <Image
                      src="/okapi-logo.png"
                      alt="Okapi"
                      fill
                      sizes="96px"
                      className="object-cover object-[48%_26%]"
                      priority
                    />
                  </span>
                </div>
                <h1 className="font-[family-name:var(--font-syne)] text-4xl font-bold tracking-tight sm:text-5xl">
                  {greeting}, {displayName}
                </h1>
                <p className="mt-3 max-w-md text-base text-okapi-ink/55">
                  Okapi, plateforme IA de MMC SARL — dis ce dont tu as besoin,
                  dans n’importe quelle langue.
                </p>
              </div>
            ) : (
              <div className="mb-3">
                <span className="text-[11px] font-semibold text-okapi-ink/40">
                  Okapi · MMC SARL
                </span>
              </div>
            )}

            {messages.length > 0 ? (
              <div className={`mt-5 w-full space-y-3 text-left ${split ? "" : "max-w-3xl"}`}>
                {messages.map((msg, i) => {
                  const isStreamingAssistant =
                    sending &&
                    msg.role === "assistant" &&
                    i === messages.length - 1;
                  const canSpeak =
                    supportedSpeak &&
                    msg.role === "assistant" &&
                    !isStreamingAssistant &&
                    msg.content.trim().length > 0 &&
                    !/^Okapi (réfléchit|analyse|debug|Flash|Pro|travaille)/i.test(
                      msg.content,
                    );
                  return (
                    <div
                      key={`${msg.role}-${i}`}
                      className={`rounded-[22px] border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "ml-8 border-okapi-forest/15 bg-okapi-forest text-white"
                          : "mr-8 border-[var(--okapi-stroke)] bg-white/85 text-okapi-ink"
                      }`}
                    >
                      {msg.imageUrl ? (
                        <div className="mb-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={msg.imageUrl}
                            alt="Pièce jointe"
                            className="max-h-40 rounded-xl border border-white/20 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              downloadDataUrl(
                                msg.imageUrl!,
                                `okapi-image-${i + 1}.png`,
                              )
                            }
                            className={`mt-1.5 text-[11px] font-semibold underline-offset-2 hover:underline ${
                              msg.role === "user"
                                ? "text-white/85"
                                : "text-okapi-forest/80"
                            }`}
                          >
                            Télécharger l’image
                          </button>
                        </div>
                      ) : null}
                      {isStreamingAssistant &&
                      /réfléchit|analyse|debug|en cours|travaille|Écriture/i.test(
                        msg.content,
                      ) ? (
                        <span className="typing-dots inline-flex items-center gap-0.5 text-okapi-ink/50">
                          Okapi travaille
                          <span />
                          <span />
                          <span />
                        </span>
                      ) : (
                        msg.content
                      )}
                      {isStreamingAssistant &&
                      msg.content.trim() &&
                      !/réfléchit|analyse|debug|en cours|Écriture/i.test(
                        msg.content,
                      ) ? (
                        <span className="mt-2 block text-[10px] text-okapi-ink/35">
                          …
                        </span>
                      ) : null}
                      {canSpeak ? (
                        <button
                          type="button"
                          onClick={() => toggleSpeak(msg.content)}
                          className="mt-2 block text-[11px] font-semibold text-okapi-forest/80 hover:text-okapi-forest"
                        >
                          {speaking ? "Stop audio" : "Écouter"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            ) : null}

            <form
              onSubmit={onSubmit}
              className={`prompt-glow mt-auto w-full pt-4 ${
                split ? "sticky bottom-0 bg-[rgba(248,250,248,0.92)] pb-1 backdrop-blur-xl" : "mt-8 max-w-3xl"
              }`}
            >
              <div className="rounded-[26px] border border-white/90 bg-white/90 p-3">
                {attachedImage ? (
                  <div className="mb-2 flex items-center gap-3 rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/60 px-3 py-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachedImage.dataUrl}
                      alt=""
                      className="h-14 w-14 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-okapi-ink/70">
                        {attachedImage.name}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            downloadDataUrl(
                              attachedImage.dataUrl,
                              attachedImage.name,
                            )
                          }
                          className="text-[11px] font-semibold text-okapi-forest"
                        >
                          Télécharger
                        </button>
                        <button
                          type="button"
                          onClick={() => setAttachedImage(null)}
                          className="text-[11px] font-semibold text-okapi-ink/45"
                        >
                          Retirer
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                <textarea
                  value={prompt}
                  onChange={(e) => {
                    setDraftVoice("");
                    setPrompt(e.target.value);
                  }}
                  rows={split ? 2 : 3}
                  placeholder={
                    listening
                      ? "Écoute… parle maintenant"
                      : debugArmed
                        ? "Colle l’erreur ou décris le bug…"
                        : attachedImage
                          ? "Que faire avec cette image ?"
                          : previewHtml
                            ? "Modifie, debug, ou dis ce qu’il faut changer…"
                            : "Écris, parle ou ajoute une image…"
                  }
                  className="min-h-[64px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-relaxed outline-none placeholder:text-okapi-ink/35"
                />
                {draftVoice ? (
                  <p className="px-2 text-xs italic text-okapi-ink/45">{draftVoice}</p>
                ) : null}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        void onPickImage(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setEngineOpen((o) => !o)}
                        disabled={sending}
                        className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist px-3 text-xs font-semibold text-okapi-ink/75 transition hover:bg-white disabled:opacity-60"
                        aria-expanded={engineOpen}
                        aria-haspopup="listbox"
                      >
                        {engine === "pro" ? "Okapi Pro" : "Okapi Flash"}
                        <span className="text-[10px] font-medium text-okapi-ink/35">
                          ▾
                        </span>
                      </button>
                      {engineOpen ? (
                        <div
                          className="absolute bottom-[calc(100%+6px)] left-0 z-30 w-64 overflow-hidden rounded-2xl border border-[var(--okapi-stroke)] bg-white/95 shadow-lg backdrop-blur-md"
                          role="listbox"
                        >
                          {OKAPI_ENGINES.map((item) => {
                            const active = engine === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setEngine(item.id);
                                  setStoredEngine(item.id);
                                  setEngineOpen(false);
                                }}
                                className={`flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left transition ${
                                  active
                                    ? "bg-okapi-forest/10"
                                    : "hover:bg-okapi-mist/80"
                                }`}
                              >
                                <span className="flex items-center gap-2 text-xs font-semibold text-okapi-ink">
                                  {item.label}
                                  {item.badge ? (
                                    <span className="rounded-full bg-okapi-amber/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-okapi-amber-deep">
                                      {item.badge}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="text-[11px] leading-snug text-okapi-ink/45">
                                  {item.hint}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDebugArmed((v) => !v)}
                      disabled={sending}
                      className={`inline-flex h-11 items-center justify-center rounded-2xl border px-3 text-xs font-semibold transition disabled:opacity-60 ${
                        debugArmed
                          ? "border-okapi-amber/40 bg-okapi-amber text-white"
                          : "border-[var(--okapi-stroke)] bg-okapi-mist text-okapi-ink/70 hover:bg-white"
                      }`}
                      title={
                        previewHtml
                          ? "Mode Debug — corrige la Preview"
                          : "Mode Debug — analyse une erreur"
                      }
                      aria-label="Mode Debug"
                      aria-pressed={debugArmed}
                    >
                      Debug
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist text-okapi-ink/70 transition hover:bg-white disabled:opacity-60"
                      title="Ajouter une image"
                      aria-label="Ajouter une image"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <circle cx="9" cy="10" r="1.5" />
                        <path d="M21 16l-5-5-8 8" />
                      </svg>
                    </button>
                    {supportedListen ? (
                      <button
                        type="button"
                        onClick={toggleListen}
                        disabled={sending}
                        className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition ${
                          listening
                            ? "border-okapi-amber/40 bg-okapi-amber text-white"
                            : "border-[var(--okapi-stroke)] bg-okapi-mist text-okapi-ink/70 hover:bg-white"
                        }`}
                        title={listening ? "Arrêter le micro" : "Dicter"}
                        aria-label={listening ? "Arrêter le micro" : "Dicter"}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <rect x="9" y="3" width="6" height="11" rx="3" />
                          <path d="M5 11a7 7 0 0014 0M12 18v3" />
                        </svg>
                      </button>
                    ) : null}
                    {listening ? (
                      <span className="text-[11px] font-medium text-okapi-amber-deep">
                        Micro actif
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    disabled={sending}
                    className="inline-flex items-center gap-2 rounded-2xl bg-okapi-amber px-5 py-3 text-sm font-semibold text-white transition hover:bg-okapi-amber-deep disabled:opacity-60"
                  >
                    {sending ? "…" : "Envoyer"}
                  </button>
                </div>
              </div>
              {audioError ? (
                <p className="mt-2 text-sm text-okapi-amber-deep">{audioError}</p>
              ) : status ? (
                <p className="mt-2 text-sm text-okapi-amber-deep">{status}</p>
              ) : (
                <p className="mt-2 text-[11px] text-okapi-ink/35">
                  {debugArmed
                    ? "Mode Debug actif — colle l’erreur puis Envoyer"
                    : "Image · micro · Debug — l’agent agit sur demande"}
                </p>
              )}
            </form>
          </div>
        </section>

        {split ? (
          <WorkspacePanel
            title={previewTitle}
            html={previewHtml}
            react={previewReact}
            reactNative={previewReactNative}
            nextjs={previewNext}
            sql={previewSql}
            api={previewApi}
            python={previewPython}
            flutter={previewFlutter}
            readme={previewReadme}
            sending={sending}
            device={device}
            onDeviceChange={setDevice}
            shareBusy={shareBusy}
            shareUrl={shareUrl}
            onShare={() => void shareProject()}
            onExportHtml={exportHtml}
            onExportSql={exportSql}
            onExportApi={exportApi}
            onExportReadme={exportReadme}
            onExportZip={exportZip}
            onChangeArtifact={onChangeArtifact}
            onSaveCloud={() => void saveCloudNow()}
            onStudioCommitted={applyStudioCommit}
            cloudStatus={saveBusy ? "Sauvegarde…" : cloudStatus}
            engine={engine}
            focusPreviewKey={workspaceFocusKey}
          />
        ) : null}
      </div>
    </main>
  );
}
