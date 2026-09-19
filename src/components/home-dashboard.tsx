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
import {
  wantsAppBuild,
  wantsDebug,
  chatDeniedBuilder,
  getStoredAgentLane,
  setStoredAgentLane,
  type OkapiAgentLane,
} from "@/lib/intent";
import { resolveGenerateMode, wantsLargeProject } from "@/lib/fullstack";
import {
  getStoredEngine,
  OKAPI_ENGINES,
  setStoredEngine,
  type OkapiEngine,
} from "@/lib/okapi-engine";
import type { OkapiProject } from "@/lib/supabase";
import type { OkapiArtifacts } from "@/lib/project-artifacts";
import {
  artifactsFromSnap,
  ensureReadmeArtifact,
  keepOrReplace,
  listFilledArtifactLabels,
} from "@/lib/project-artifacts";
import { parseGenerateStreamLine } from "@/lib/generate-stream";
import { stripOkapiRuntime } from "@/lib/okapi-runtime";
import { WorkspacePanel } from "@/components/workspace-panel";
import {
  studioFileIdToArtifactKey,
  studioZipEntries,
  type StudioFileId,
} from "@/lib/studio-files";
import { coachNextStep } from "@/lib/okapi-intelligence";

type HomeDashboardProps = {
  section: string;
  resetKey?: number;
  /** Incrémente à chaque clic sidebar Studio pour forcer l’ouverture. */
  studioKick?: number;
  initialProject?: OkapiProject | null;
  /** Ouvre directement Okapi Studio (mode Dev). */
  openInStudio?: boolean;
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
  studioKick = 0,
  initialProject = null,
  openInStudio = false,
  onGoHome,
  onNavigate,
}: HomeDashboardProps) {
  const { user, displayName, authFetch, signOut, accessToken } = useAuth();
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
  const [previewPackageJson, setPreviewPackageJson] = useState<string | null>(
    null,
  );
  const [previewSql, setPreviewSql] = useState<string | null>(null);
  const [previewApi, setPreviewApi] = useState<string | null>(null);
  const [previewPython, setPreviewPython] = useState<string | null>(null);
  const [previewRequirements, setPreviewRequirements] = useState<string | null>(
    null,
  );
  const [previewFlutter, setPreviewFlutter] = useState<string | null>(null);
  const [previewPubspec, setPreviewPubspec] = useState<string | null>(null);
  const [previewReadme, setPreviewReadme] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("Preview");
  const [workspaceFocusKey, setWorkspaceFocusKey] = useState(0);
  const [studioFocusKey, setStudioFocusKey] = useState(0);
  const [studioSeedKey, setStudioSeedKey] = useState(0);
  const [studioSeedMessages, setStudioSeedMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [studioHandoffReady, setStudioHandoffReady] = useState(false);
  const [debugArmed, setDebugArmed] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [engine, setEngine] = useState<OkapiEngine>("flash");
  const [engineOpen, setEngineOpen] = useState(false);
  /** conseil = savoir/contenu (pas Studio) · creer = apps + handoff Studio */
  const [agentLane, setAgentLane] = useState<OkapiAgentLane>("conseil");
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
  const devModeRef = useRef(false);
  const snapRef = useRef({
    html: null as string | null,
    react: null as string | null,
    reactNative: null as string | null,
    nextjs: null as string | null,
    packageJson: null as string | null,
    sql: null as string | null,
    api: null as string | null,
    python: null as string | null,
    requirements: null as string | null,
    flutter: null as string | null,
    pubspec: null as string | null,
    readme: null as string | null,
    title: "Preview",
    sector: "Général",
  });
  const saveBusyRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const saveDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    snapRef.current = {
      html: previewHtml,
      react: previewReact,
      reactNative: previewReactNative,
      nextjs: previewNext,
      packageJson: previewPackageJson,
      sql: previewSql,
      api: previewApi,
      python: previewPython,
      requirements: previewRequirements,
      flutter: previewFlutter,
      pubspec: previewPubspec,
      readme: previewReadme,
      title: previewTitle,
      sector,
    };
  }, [
    previewHtml,
    previewReact,
    previewReactNative,
    previewNext,
    previewPackageJson,
    previewSql,
    previewApi,
    previewPython,
    previewRequirements,
    previewFlutter,
    previewPubspec,
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
    setAgentLane(getStoredAgentLane());
  }, []);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    devModeRef.current = devMode;
  }, [devMode]);

  useEffect(() => {
    setGreeting(greetingFromHour(new Date().getHours()));
  }, []);

  const openInStudioRef = useRef(openInStudio);
  openInStudioRef.current = openInStudio;

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
    const goStudio = openInStudioRef.current;
    if (initialProject) {
      setSector(initialProject.sector || "Général");
      setPreviewHtml(initialProject.html || null);
      setPreviewReact(initialProject.artifacts?.react ?? null);
      setPreviewReactNative(initialProject.artifacts?.reactNative ?? null);
      setPreviewNext(initialProject.artifacts?.nextjs ?? null);
      setPreviewPackageJson(initialProject.artifacts?.packageJson ?? null);
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
      setPreviewRequirements(initialProject.artifacts?.requirements ?? null);
      setPreviewFlutter(initialProject.artifacts?.flutter ?? null);
      setPreviewPubspec(initialProject.artifacts?.pubspec ?? null);
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
      setDevMode(goStudio);
      setDebugArmed(false);
      if (goStudio) {
        setStudioFocusKey((k) => k + 1);
        setMessages([
          {
            role: "assistant",
            content: `Studio ouvert : ${initialProject.title}. Chat = conseils · Studio = code Okapi.`,
          },
        ]);
      } else {
        setWorkspaceFocusKey((k) => k + 1);
        setMessages([
          {
            role: "assistant",
            content: `Projet ouvert : ${initialProject.title}. Dis-moi ce dont tu as besoin.`,
          },
        ]);
      }
    } else {
      setSector("Général");
      setPreviewHtml(null);
      setPreviewReact(null);
      setPreviewReactNative(null);
      setPreviewNext(null);
      setPreviewPackageJson(null);
      setPreviewSql(null);
      setPreviewApi(null);
      setPreviewPython(null);
      setPreviewRequirements(null);
      setPreviewFlutter(null);
      setPreviewPubspec(null);
      setPreviewReadme(null);
      setPreviewTitle("Preview");
      setProjectId(null);
      projectIdRef.current = null;
      setCloudStatus(null);
      setDevMode(goStudio);
      setDebugArmed(false);
      if (goStudio) {
        setStudioFocusKey((k) => k + 1);
        setMessages([
          {
            role: "assistant",
            content:
              "Studio Okapi ouvert — tu peux générer sans compte. Connexion + Sauver pour garder le projet. Accepte pour appliquer les fichiers.",
          },
        ]);
      }
    }
    // openInStudio lu via ref : ne pas le mettre en deps (sinon ça efface la preview au clic Studio)
  }, [resetKey, initialProject, stopListen, stopSpeak]);

  // Accueil Agent = jamais Studio immersif. Studio uniquement si openInStudio (#studio).
  useEffect(() => {
    if (!openInStudio) {
      setDevMode(false);
      return;
    }
    setDevMode(true);
    setDebugArmed(false);
    setStudioFocusKey((k) => k + 1);
  }, [openInStudio, studioKick]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const isHome = section === "dashboard";
  const immersiveStudio = devMode;
  const split =
    Boolean(
      previewHtml ||
        previewReact ||
        previewReactNative ||
        previewNext ||
        previewPackageJson ||
        previewSql ||
        previewApi ||
        previewPython ||
        previewRequirements ||
        previewFlutter ||
        previewPubspec ||
        previewReadme,
    ) ||
    sending ||
    immersiveStudio;

  function leaveStudio() {
    setDevMode(false);
    onNavigate?.("home");
  }

  /** Efface workspace + conversation ; reste en Studio si déjà ouvert. */
  function startFreshProject(opts?: { stayInStudio?: boolean }) {
    const stay = opts?.stayInStudio ?? immersiveStudio;
    stopSpeak();
    stopListen();
    setPreviewHtml(null);
    setPreviewReact(null);
    setPreviewReactNative(null);
    setPreviewNext(null);
    setPreviewPackageJson(null);
    setPreviewSql(null);
    setPreviewApi(null);
    setPreviewPython(null);
    setPreviewRequirements(null);
    setPreviewFlutter(null);
    setPreviewPubspec(null);
    setPreviewReadme(null);
    setPreviewTitle("Preview");
    setProjectId(null);
    projectIdRef.current = null;
    setCloudStatus(null);
    setDebugArmed(false);
    setStatus(null);
    setPrompt("");
    setSector("Général");
    setDevMode(stay);
    if (stay) {
      setStudioFocusKey((k) => k + 1);
      const welcome = {
        role: "assistant" as const,
        content:
          "Nouveau projet. Décris l’app à créer — Okapi génère les fichiers ici.",
      };
      setMessages([welcome]);
      setStudioSeedMessages([welcome]);
      setStudioSeedKey((k) => k + 1);
      onNavigate?.("studio");
    } else {
      setMessages([]);
      setStudioSeedMessages([]);
      setStudioSeedKey((k) => k + 1);
      onNavigate?.("home");
    }
  }

  function continueInStudio() {
    setDevMode(true);
    setDebugArmed(false);
    setStudioFocusKey((k) => k + 1);
    setStudioHandoffReady(false);
    onNavigate?.("studio");
  }

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
      let artifacts = ensureReadmeArtifact(
        artifactsFromSnap({
          react: keepOrReplace(payload.artifacts?.react, snap.react),
          reactNative: keepOrReplace(
            payload.artifacts?.reactNative,
            snap.reactNative,
          ),
          nextjs: keepOrReplace(payload.artifacts?.nextjs, snap.nextjs),
          packageJson: keepOrReplace(
            payload.artifacts?.packageJson,
            snap.packageJson,
          ),
          sql: keepOrReplace(payload.artifacts?.sql, snap.sql),
          api: keepOrReplace(payload.artifacts?.api, snap.api),
          python: keepOrReplace(payload.artifacts?.python, snap.python),
          requirements: keepOrReplace(
            payload.artifacts?.requirements,
            snap.requirements,
          ),
          flutter: keepOrReplace(payload.artifacts?.flutter, snap.flutter),
          pubspec: keepOrReplace(payload.artifacts?.pubspec, snap.pubspec),
          readme: keepOrReplace(payload.artifacts?.readme, snap.readme),
          images: payload.artifacts?.images,
        }),
        { title: payload.title, hasHtml: Boolean(payload.html?.trim()) },
      );

      // Keep UI in sync if we synthesized a README
      if (artifacts.readme && artifacts.readme !== snap.readme) {
        snapRef.current = { ...snapRef.current, readme: artifacts.readme };
        setPreviewReadme(artifacts.readme);
      }

      const body = {
        title: payload.title,
        sector: payload.sector,
        html: stripOkapiRuntime(payload.html || ""),
        summary: payload.summary,
        // Full explicit bundle — server merges only present keys; we send all.
        artifacts: {
          react: artifacts.react ?? null,
          reactNative: artifacts.reactNative ?? null,
          nextjs: artifacts.nextjs ?? null,
          packageJson: artifacts.packageJson ?? null,
          sql: artifacts.sql ?? null,
          api: artifacts.api ?? null,
          python: artifacts.python ?? null,
          requirements: artifacts.requirements ?? null,
          flutter: artifacts.flutter ?? null,
          pubspec: artifacts.pubspec ?? null,
          readme: artifacts.readme ?? null,
          ...(artifacts.images?.length ? { images: artifacts.images } : {}),
        },
        sql: artifacts.sql ?? null,
        api: artifacts.api ?? null,
        readme: artifacts.readme ?? null,
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
    const key = studioFileIdToArtifactKey(fileId);
    const safe =
      fileId === "app.html" ? stripOkapiRuntime(content || "") : content;
    const next = safe || null;
    snapRef.current = { ...snapRef.current, [key]: next };
    onChangeArtifact(fileId, safe);
    scheduleCloudSave();
  }

  function scheduleCloudSave() {
    if (saveDebounceRef.current) {
      window.clearTimeout(saveDebounceRef.current);
    }
    saveDebounceRef.current = window.setTimeout(() => {
      saveDebounceRef.current = null;
      void saveCloudNow({ silent: true });
    }, 280);
  }

  async function saveCloudNow(opts?: { silent?: boolean }): Promise<boolean> {
    const snap = snapRef.current;
    if (
      !snap.html &&
      !snap.react &&
      !snap.reactNative &&
      !snap.nextjs &&
      !snap.packageJson &&
      !snap.sql &&
      !snap.api &&
      !snap.python &&
      !snap.requirements &&
      !snap.flutter &&
      !snap.pubspec &&
      !snap.readme
    ) {
      setCloudStatus("Rien à sauver");
      if (!opts?.silent) {
        setStatus("Rien à sauvegarder — génère ou édite d’abord.");
      }
      return false;
    }
    if (!user) {
      setCloudStatus("Invité · non sauvé");
      if (!opts?.silent) {
        setStatus(
          "Tu peux générer sans compte. Connecte-toi pour sauvegarder en cloud.",
        );
        onNavigate?.("login");
      }
      return false;
    }
    if (saveBusyRef.current) {
      saveQueuedRef.current = true;
      // Ne pas renvoyer false trop tôt : la file va relancer. Attendre un peu.
      await new Promise((r) => window.setTimeout(r, 400));
      if (saveBusyRef.current) return false;
      return saveCloudNow({ silent: true });
    }
    saveBusyRef.current = true;
    setSaveBusy(true);
    setCloudStatus("Sauvegarde…");
    const err = await persistProject({
      title: snap.title || "Projet Okapi",
      sector: snap.sector,
      html: snap.html || "",
      summary: "Sauvegarde Studio Okapi",
      artifacts: artifactsFromSnap(snap),
    });
    saveBusyRef.current = false;
    setSaveBusy(false);
    if (saveQueuedRef.current) {
      saveQueuedRef.current = false;
      return saveCloudNow({ silent: true });
    }
    if (err) {
      setCloudStatus("Échec cloud");
      if (!opts?.silent) setStatus(err);
      return false;
    }
    const labels = listFilledArtifactLabels(artifactsFromSnap(snap), snap.html);
    setCloudStatus(
      labels.length ? `Cloud · ${labels.length} fichier${labels.length > 1 ? "s" : ""}` : "Cloud · à jour",
    );
    if (!opts?.silent) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: labels.length
            ? `Projet sauvegardé (${labels.join(", ")}).`
            : "Projet sauvegardé sur ton compte Okapi.",
        },
      ]);
    }
    return true;
  }

  async function onPickImage(file: File | null) {
    if (!file) return;
    try {
      setStatus("Préparation de l’image…");
      const img = await fileToAttachedImage(file);
      setAttachedImage(img);
      setStatus("Image prête — Okapi pourra la lire.");
    } catch (err) {
      setAttachedImage(null);
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
      studioZipEntries({
        html: previewHtml,
        react: previewReact,
        reactNative: previewReactNative,
        nextjs: previewNext,
        packageJson: previewPackageJson,
        sql: previewSql,
        api: previewApi,
        python: previewPython,
        requirements: previewRequirements,
        flutter: previewFlutter,
        pubspec: previewPubspec,
        readme: previewReadme,
      }),
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
    const key = studioFileIdToArtifactKey(id);
    const next = value || null;
    if (key === "html") setPreviewHtml(next);
    else if (key === "react") setPreviewReact(next);
    else if (key === "reactNative") setPreviewReactNative(next);
    else if (key === "nextjs") setPreviewNext(next);
    else if (key === "packageJson") setPreviewPackageJson(next);
    else if (key === "sql") setPreviewSql(next);
    else if (key === "api") setPreviewApi(next);
    else if (key === "python") setPreviewPython(next);
    else if (key === "requirements") setPreviewRequirements(next);
    else if (key === "flutter") setPreviewFlutter(next);
    else if (key === "pubspec") setPreviewPubspec(next);
    else if (key === "readme") setPreviewReadme(next);
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
    // Debug + Preview = corriger l’app (les 2 lanes) ; sinon build selon lane
    const build =
      !imagePayload &&
      (wantsAppBuild(trimmed, Boolean(previewHtml), agentLane) ||
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
              "Décris cette image clairement et dis ce qui est utile.",
            sector,
            language: activeLang,
            history: historyForChat,
            debug,
            engine,
            lane: agentLane,
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

        // Le chat a parfois inventé « constructeur indisponible » → relance le vrai builder (lane Créateur seulement).
        if (
          agentLane === "creer" &&
          chatDeniedBuilder(finalAnswer) &&
          trimmed.length >= 12
        ) {
          setAssistant(
            "Okapi lance le constructeur… (catalogue / stock / panier).",
          );
          const buildMessage = /^\s*cr[eé]e/i.test(trimmed)
            ? trimmed
            : `Crée une app : ${trimmed}`;
          const genRes = await authFetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: buildMessage,
              sector,
              language: activeLang,
              mode: resolveGenerateMode(
                buildMessage,
                previewSql || previewApi || wantsLargeProject(buildMessage)
                  ? "fullstack"
                  : "auto",
              ),
              engine,
              currentHtml: previewHtml ?? undefined,
              currentSql: previewSql ?? undefined,
              currentApi: previewApi ?? undefined,
              stream: true,
            }),
          });
          if (genRes.ok && genRes.body) {
            // Réutilise le flux generate ci-dessous via jump : on laisse tomber le chat
            // et on traite le stream comme un build normal.
            const reader2 = genRes.body.getReader();
            const decoder2 = new TextDecoder();
            let buffer2 = "";
            let chars2 = 0;
            let gotDone2 = false;
            const started2 = Date.now();

            const handleEv = async (line: string) => {
              if (!line.trim()) return;
              const event = parseGenerateStreamLine(line);
              if (event.type === "status" && event.message) {
                setAssistant(event.message);
              } else if (event.type === "delta" && event.text) {
                chars2 += event.text.length;
                const sec = Math.round((Date.now() - started2) / 1000);
                setAssistant(
                  `Écriture… ${chars2.toLocaleString("fr-FR")} car. · ${sec}s`,
                );
              } else if (event.type === "done" && event.html) {
                gotDone2 = true;
                const sec = Math.round((Date.now() - started2) / 1000);
                const title = event.title || "Preview Okapi";
                const nextReact = keepOrReplace(
                  event.react,
                  snapRef.current.react,
                );
                const nextRn = keepOrReplace(
                  event.reactNative,
                  snapRef.current.reactNative,
                );
                const nextNext = keepOrReplace(
                  event.nextjs,
                  snapRef.current.nextjs,
                );
                const nextSql = keepOrReplace(event.sql, snapRef.current.sql);
                const nextApi = keepOrReplace(event.api, snapRef.current.api);
                const nextReadme = keepOrReplace(
                  event.readme,
                  snapRef.current.readme,
                );
                setPreviewHtml(event.html);
                setPreviewReact(nextReact);
                setPreviewReactNative(nextRn);
                setPreviewNext(nextNext);
                setPreviewSql(nextSql);
                setPreviewApi(nextApi);
                setPreviewReadme(nextReadme);
                setPreviewTitle(title);
                setWorkspaceFocusKey((k) => k + 1);
                const offerStudio = agentLane === "creer";
                setStudioHandoffReady(offerStudio);
                setStudioSeedMessages([
                  { role: "user", content: buildMessage },
                  {
                    role: "assistant",
                    content: [
                      event.summary ?? `Preview « ${title} » prête.`,
                      offerStudio
                        ? "Projet prêt. Clique Continuer dans Studio pour éditer."
                        : "Preview prête — teste ici. Studio reste optionnel.",
                    ].join(" "),
                  },
                ]);
                setStudioSeedKey((k) => k + 1);
                snapRef.current = {
                  ...snapRef.current,
                  html: event.html,
                  react: nextReact,
                  reactNative: nextRn,
                  nextjs: nextNext,
                  sql: nextSql,
                  api: nextApi,
                  readme: nextReadme,
                  title,
                  sector,
                };
                const bundle = ensureReadmeArtifact(
                  artifactsFromSnap(snapRef.current),
                  { title, hasHtml: true },
                );
                if (bundle.readme && bundle.readme !== nextReadme) {
                  setPreviewReadme(bundle.readme);
                  snapRef.current = {
                    ...snapRef.current,
                    readme: bundle.readme,
                  };
                }
                const saveNote = await persistProject({
                  title,
                  sector,
                  html: event.html,
                  summary: event.summary,
                  artifacts: bundle,
                });
                const labels = listFilledArtifactLabels(bundle, event.html);
                if (!saveNote && user) {
                  setCloudStatus(
                    labels.length
                      ? `Cloud · ${labels.length} fichier${labels.length > 1 ? "s" : ""}`
                      : "Cloud · à jour",
                  );
                } else if (saveNote) setCloudStatus("Cloud · à connecter");
                setAssistant(
                  [
                    event.summary ?? "Preview prête.",
                    labels.length
                      ? `· Livrables : ${labels.join(" + ")}`
                      : "",
                    `(${sec}s)`,
                    saveNote
                      ? `· ${saveNote}`
                      : user
                        ? "· Sauvegardé cloud"
                        : "",
                    offerStudio
                      ? "· Studio prêt — continue l’édition là-bas."
                      : "· Preview prête — reste ici pour tester.",
                    `\n\n${coachNextStep({
                      hasHtml: Boolean(event.html),
                      hasSql: Boolean(nextSql || event.sql),
                      loggedIn: Boolean(user),
                      projectSaved: Boolean(user && !saveNote),
                      sector,
                      offerStudio,
                    })}`,
                  ]
                    .filter(Boolean)
                    .join(" "),
                );
                setStatus("Preview prête");
                if (voiceOutRef.current) {
                  speak(event.summary ?? "Preview prête.");
                }
              } else if (event.type === "error") {
                throw new Error(event.error || "Génération impossible.");
              }
            };

            while (true) {
              const { done, value } = await reader2.read();
              if (done) break;
              buffer2 += decoder2.decode(value, { stream: true });
              const lines = buffer2.split("\n");
              buffer2 = lines.pop() ?? "";
              for (const line of lines) await handleEv(line);
            }
            if (buffer2.trim()) await handleEv(buffer2);
            if (!gotDone2) {
              throw new Error(
                "Okapi n’a pas terminé la génération. Réessaie dans quelques secondes.",
              );
            }
            return;
          }
          // Si generate échoue, on montre un message clair au lieu du faux « indisponible »
          finalAnswer =
            "Le constructeur Okapi est prêt. Envoie : « Crée une app boutique Kinshasa : catalogue, stock, panier, WhatsApp + Mobile Money, prix CDF. »";
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

      const res = await authFetch("/api/generate", {
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
      let gotDone = false;

      const handleGenerateEvent = async (line: string) => {
        if (!line.trim()) return;
        const event = parseGenerateStreamLine(line);

        if (event.type === "status" && event.message) {
          setAssistant(event.message);
        } else if (event.type === "delta" && event.text) {
          chars += event.text.length;
          const sec = Math.round((Date.now() - started) / 1000);
          setAssistant(
            `Écriture… ${chars.toLocaleString("fr-FR")} car. · ${sec}s`,
          );
        } else if (event.type === "done" && event.html) {
          gotDone = true;
          const sec = Math.round((Date.now() - started) / 1000);
          const title = event.title || "Preview Okapi";
          const nextReact = keepOrReplace(event.react, snapRef.current.react);
          const nextRn = keepOrReplace(
            event.reactNative,
            snapRef.current.reactNative,
          );
          const nextNext = keepOrReplace(event.nextjs, snapRef.current.nextjs);
          const nextSql = keepOrReplace(event.sql, snapRef.current.sql);
          const nextApi = keepOrReplace(event.api, snapRef.current.api);
          const nextReadme = keepOrReplace(
            event.readme,
            snapRef.current.readme,
          );

          setPreviewHtml(event.html);
          setPreviewReact(nextReact);
          setPreviewReactNative(nextRn);
          setPreviewNext(nextNext);
          setPreviewSql(nextSql);
          setPreviewApi(nextApi);
          setPreviewReadme(nextReadme);
          setPreviewTitle(title);
          // Preview d’abord — Studio seulement en lane Créateur
          setWorkspaceFocusKey((k) => k + 1);
          const offerStudio = agentLane === "creer";
          setStudioHandoffReady(offerStudio);
          setStudioSeedMessages([
            { role: "user", content: trimmed },
            {
              role: "assistant",
              content: [
                event.summary ?? `Preview « ${title} » prête.`,
                offerStudio
                  ? "Projet prêt. Clique Continuer dans Studio pour éditer, ou demande une modif ici."
                  : "Preview prête — teste ici. Passe en mode Créateur si tu veux Studio.",
              ].join(" "),
            },
          ]);
          setStudioSeedKey((k) => k + 1);

          snapRef.current = {
            ...snapRef.current,
            html: event.html,
            react: nextReact,
            reactNative: nextRn,
            nextjs: nextNext,
            sql: nextSql,
            api: nextApi,
            readme: nextReadme,
            title,
            sector,
          };

          const bundle = ensureReadmeArtifact(
            artifactsFromSnap(snapRef.current),
            { title, hasHtml: true },
          );
          if (bundle.readme && bundle.readme !== nextReadme) {
            setPreviewReadme(bundle.readme);
            snapRef.current = { ...snapRef.current, readme: bundle.readme };
          }

          const saveNote = await persistProject({
            title,
            sector,
            html: event.html,
            summary: event.summary,
            artifacts: bundle,
          });
          const labels = listFilledArtifactLabels(bundle, event.html);
          if (!saveNote && user) {
            setCloudStatus(
              labels.length
                ? `Cloud · ${labels.length} fichier${labels.length > 1 ? "s" : ""}`
                : "Cloud · à jour",
            );
          } else if (saveNote) setCloudStatus("Cloud · à connecter");

          setAssistant(
            [
              event.summary ?? "Preview prête.",
              labels.length ? `· Livrables : ${labels.join(" + ")}` : "",
              `(${sec}s)`,
              saveNote
                ? `· ${saveNote}`
                : user
                  ? "· Sauvegardé cloud"
                  : "",
              offerStudio
                ? "· Studio prêt — continue l’édition là-bas."
                : "· Preview prête — reste ici pour tester.",
              `\n\n${coachNextStep({
                hasHtml: Boolean(event.html),
                hasSql: Boolean(nextSql || event.sql),
                loggedIn: Boolean(user),
                projectSaved: Boolean(user && !saveNote),
                sector,
                offerStudio,
              })}`,
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
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          await handleGenerateEvent(line);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) await handleGenerateEvent(buffer);
      if (!gotDone) {
        throw new Error(
          "Okapi n’a pas terminé la génération. Réessaie dans quelques secondes.",
        );
      }
    } catch (err) {
      const raw = (err instanceof Error ? err.message : "").trim();
      const soft = !raw
        ? "Okapi n’a pas pu répondre. Réessaie dans quelques secondes."
        : /trop de requ[eê]tes|rate.?limit|okapi_rate_limit/i.test(raw)
          ? "Trop de requêtes. Attends 20 secondes puis réessaie."
          : /limite du jour|okapi_quota/i.test(raw)
            ? "Okapi a atteint la limite du jour pour ta session. Réessaie demain."
            : /très sollicité|okapi_busy|saturé/i.test(raw)
              ? "Okapi est très sollicité. Réessaie dans quelques secondes."
              : /crédit|credits|billing|402/i.test(raw)
                ? "Le crédit IA Okapi est épuisé. Réessaie plus tard."
                : /^Okapi\b|^Le crédit\b|^Trop de\b|^Réponse Okapi\b/i.test(raw)
                  ? raw
                  : "Okapi n’a pas pu répondre. Réessaie dans quelques secondes.";
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

  const workspacePanelProps = {
    title: previewTitle,
    html: previewHtml,
    react: previewReact,
    reactNative: previewReactNative,
    nextjs: previewNext,
    packageJson: previewPackageJson,
    sql: previewSql,
    api: previewApi,
    python: previewPython,
    requirements: previewRequirements,
    flutter: previewFlutter,
    pubspec: previewPubspec,
    readme: previewReadme,
    sending,
    device,
    onDeviceChange: setDevice,
    shareBusy,
    shareUrl,
    onShare: () => void shareProject(),
    onExportHtml: exportHtml,
    onExportSql: exportSql,
    onExportApi: exportApi,
    onExportReadme: exportReadme,
    onExportZip: exportZip,
    onChangeArtifact,
    onSaveCloud: (opts?: { silent?: boolean }) => saveCloudNow(opts),
    onStudioCommitted: applyStudioCommit,
    cloudStatus: saveBusy ? "Sauvegarde…" : cloudStatus,
    engine,
    sector,
    projectId,
    accessToken,
    focusPreviewKey: workspaceFocusKey,
    focusStudioKey: studioFocusKey,
    studioSeedKey,
    studioSeedMessages,
    onNewProject: () => startFreshProject({ stayInStudio: true }),
  };

  const messageListBlock =
    messages.length > 0 ? (
      <div className={`w-full space-y-2 text-left ${split ? "" : "max-w-2xl"}`}>
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
              className={`rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "ml-6 bg-okapi-forest text-white"
                  : "mr-4 border border-[var(--okapi-stroke)] bg-white/90 text-okapi-ink"
              }`}
            >
              {msg.imageUrl ? (
                <div className="mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={msg.imageUrl}
                    alt="Pièce jointe"
                    className="max-h-36 rounded-lg border border-white/20 object-cover"
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
                <span className="mt-1.5 block text-[10px] text-okapi-ink/35">
                  …
                </span>
              ) : null}
              {canSpeak ? (
                <button
                  type="button"
                  onClick={() => toggleSpeak(msg.content)}
                  className="mt-1.5 block text-[11px] font-semibold text-okapi-forest/80 hover:text-okapi-forest"
                >
                  {speaking ? "Stop audio" : "Écouter"}
                </button>
              ) : null}
              {msg.role === "assistant" &&
              !isStreamingAssistant &&
              studioHandoffReady &&
              agentLane === "creer" &&
              i === messages.length - 1 &&
              previewHtml &&
              !immersiveStudio ? (
                <button
                  type="button"
                  onClick={continueInStudio}
                  className="mt-2.5 inline-flex items-center gap-2 rounded-lg bg-okapi-forest px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-okapi-forest/90"
                >
                  Continuer dans Studio
                </button>
              ) : null}
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>
    ) : null;

  const renderPromptForm = (
    formSplit: boolean,
    extraClass = "",
  ) => (
    <form
      onSubmit={onSubmit}
      className={`okapi-composer w-full ${extraClass} ${
        formSplit
          ? "mt-auto sticky bottom-0 z-20 bg-[rgba(248,250,248,0.96)] pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md"
          : "mt-6 max-w-2xl"
      }`}
    >
      <div className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/95 p-2.5 shadow-sm">
        {attachedImage ? (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-[var(--okapi-stroke)] bg-okapi-mist/60 px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachedImage.dataUrl}
              alt=""
              className="h-12 w-12 rounded-lg object-cover"
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
          rows={formSplit ? 2 : 3}
          placeholder={
            listening
              ? "Écoute… parle maintenant"
              : debugArmed
                ? "Colle l’erreur ou décris le bug…"
                : agentLane === "conseil"
                  ? attachedImage
                    ? "Que faire avec cette image ?"
                    : "Pose une question, demande un conseil ou un contenu…"
                  : devMode
                    ? "Demande un conseil — le code s’édite dans Studio…"
                    : attachedImage
                      ? "Que faire avec cette image ?"
                      : previewHtml
                        ? "Modifie, debug, ou dis ce qu’il faut changer…"
                        : "Décris l’app ou le site à créer…"
          }
          className="min-h-[52px] w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed outline-none placeholder:text-okapi-ink/35"
        />
        {draftVoice ? (
          <p className="px-2 text-xs italic text-okapi-ink/45">{draftVoice}</p>
        ) : null}
        <div className="mt-1 flex flex-col gap-1.5">
          <div
            className="inline-flex h-9 w-full items-stretch rounded-lg border border-[var(--okapi-stroke)] bg-okapi-mist p-0.5 sm:w-auto sm:self-start"
            role="group"
            aria-label="Mode agent"
          >
            <button
              type="button"
              disabled={sending}
              onClick={() => {
                setAgentLane("conseil");
                setStoredAgentLane("conseil");
                setStudioHandoffReady(false);
                setDevMode(false);
                onNavigate?.("home");
              }}
              className={`min-w-0 flex-1 rounded-md px-2 text-[11px] font-semibold transition disabled:opacity-60 sm:flex-none sm:px-2.5 ${
                agentLane === "conseil"
                  ? "bg-white text-okapi-forest shadow-sm"
                  : "text-okapi-ink/50"
              }`}
              title="Questions, recherche, contenus — sans Studio"
              aria-pressed={agentLane === "conseil"}
            >
              <span className="sm:hidden">Conseil</span>
              <span className="hidden sm:inline">Conseiller</span>
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => {
                setAgentLane("creer");
                setStoredAgentLane("creer");
              }}
              className={`min-w-0 flex-1 rounded-md px-2 text-[11px] font-semibold transition disabled:opacity-60 sm:flex-none sm:px-2.5 ${
                agentLane === "creer"
                  ? "bg-white text-okapi-forest shadow-sm"
                  : "text-okapi-ink/50"
              }`}
              title="Créer des apps + ouvrir Studio"
              aria-pressed={agentLane === "creer"}
            >
              <span className="sm:hidden">Créer</span>
              <span className="hidden sm:inline">Créateur</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
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
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--okapi-stroke)] bg-okapi-mist px-2.5 text-xs font-semibold text-okapi-ink/75 transition hover:bg-white disabled:opacity-60"
                aria-expanded={engineOpen}
                aria-haspopup="listbox"
              >
                {engine === "pro" ? "Pro" : "Flash"}
                <span className="text-[10px] font-medium text-okapi-ink/35">
                  ▾
                </span>
              </button>
              {engineOpen ? (
                <div
                  className="absolute bottom-[calc(100%+6px)] left-0 z-30 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--okapi-stroke)] bg-white/95 shadow-lg backdrop-blur-md"
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
                            <span className="rounded-md bg-okapi-amber/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-okapi-amber-deep">
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
              onClick={() => {
                setDebugArmed((v) => {
                  const next = !v;
                  if (next) setDevMode(false);
                  return next;
                });
              }}
              disabled={sending}
              className={`inline-flex h-9 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition disabled:opacity-60 ${
                debugArmed
                  ? "border-okapi-amber/40 bg-okapi-amber text-white"
                  : "border-[var(--okapi-stroke)] bg-okapi-mist text-okapi-ink/70 hover:bg-white"
              }`}
              title={
                previewHtml
                  ? "Mode Debug — corrige la Preview"
                  : "Mode Debug — analyse une erreur (sans Preview = conseil chat)"
              }
              aria-label="Mode Debug"
              aria-pressed={debugArmed}
            >
              Debug
            </button>
            {/* Studio : sidebar / Continuer — pas de 2e bouton sur mobile */}
            {!(openInStudio || immersiveStudio) && agentLane === "creer" ? (
              <button
                type="button"
                onClick={() => {
                  setDebugArmed(false);
                  setDevMode(true);
                  setStudioFocusKey((k) => k + 1);
                  onNavigate?.("studio");
                }}
                disabled={sending}
                className="hidden h-9 items-center justify-center rounded-lg border border-[var(--okapi-stroke)] bg-okapi-mist px-2.5 text-xs font-semibold text-okapi-ink/70 transition hover:bg-white disabled:opacity-60 sm:inline-flex"
                title="Ouvre Studio pour coder"
                aria-label="Studio"
              >
                Studio
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--okapi-stroke)] bg-okapi-mist text-okapi-ink/70 transition hover:bg-white disabled:opacity-60"
              title="Ajouter une image"
              aria-label="Ajouter une image"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
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
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                  listening
                    ? "border-okapi-amber/40 bg-okapi-amber text-white"
                    : "border-[var(--okapi-stroke)] bg-okapi-mist text-okapi-ink/70 hover:bg-white"
                }`}
                title={listening ? "Arrêter le micro" : "Dicter"}
                aria-label={listening ? "Arrêter le micro" : "Dicter"}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
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
                Micro
              </span>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-okapi-amber px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-okapi-amber-deep disabled:opacity-60 sm:px-4"
          >
            {sending ? "…" : "Envoyer"}
          </button>
          </div>
        </div>
      </div>
      {audioError ? (
        <p className="mt-1.5 text-xs text-okapi-amber-deep">{audioError}</p>
      ) : status ? (
        <p className="mt-1.5 text-xs text-okapi-amber-deep">{status}</p>
      ) : (
        <p className="mt-1.5 text-[10px] leading-snug text-okapi-ink/35">
          Okapi peut se tromper — vérifie les infos importantes.
          <span className="hidden sm:inline">
            {" "}
            {debugArmed
              ? "· Debug : colle l’erreur puis Envoyer."
              : agentLane === "creer"
                ? "· Créateur : Preview ici · Studio via menu."
                : "· Conseiller : chat & contenus — pas Studio."}
          </span>
        </p>
      )}
    </form>
  );

  return (
    <main
      className={`ml-0 flex min-h-0 flex-1 flex-col overflow-hidden ${
        immersiveStudio
          ? "okapi-studio-shell rounded-none border-0 lg:ml-0"
          : "app-shell rounded-[22px] lg:ml-2"
      }`}
    >
      {immersiveStudio ? null : (
      <header
        className="flex items-center justify-between gap-3 border-b border-[var(--okapi-stroke)] px-3 py-2.5 lg:px-4"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-xl ring-1 ring-[var(--okapi-stroke)]">
            <Image
              src="/okapi-logo.png"
              alt=""
              fill
              sizes="32px"
              className="object-cover object-[48%_26%]"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-[family-name:var(--font-syne)] text-sm font-bold leading-none">
                {previewHtml
                  ? previewTitle
                  : `${greeting}, ${displayName}`}
              </p>
              {sending ? (
                <span className="hidden rounded-md bg-okapi-amber/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-okapi-amber-deep sm:inline">
                  Génération
                </span>
              ) : previewHtml ? (
                <span className="hidden rounded-md bg-okapi-forest/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-okapi-forest sm:inline">
                  Live
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-[10px] text-okapi-ink/40">
              {previewHtml
                ? agentLane === "creer"
                  ? "Créateur · preview"
                  : "Conseiller · preview"
                : agentLane === "creer"
                  ? "Créateur · apps"
                  : "Conseiller · savoir & contenu"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
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
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
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
                <div className="hidden rounded-lg border border-[var(--okapi-stroke)] bg-white/80 p-0.5 sm:flex">
                  <button
                    type="button"
                    onClick={() => setDevice("mobile")}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
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
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      device === "desktop"
                        ? "bg-okapi-forest text-white"
                        : "text-okapi-ink/55 hover:text-okapi-ink"
                    }`}
                  >
                    Desktop
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => startFreshProject({ stayInStudio: false })}
                className="rounded-lg border border-[var(--okapi-stroke)] bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-okapi-ink/70 transition hover:bg-white"
                title="Effacer la conversation et démarrer un projet vide"
              >
                <span className="sm:hidden">Nouveau</span>
                <span className="hidden sm:inline">Nouveau projet</span>
              </button>
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
      )}

      {immersiveStudio ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <WorkspacePanel
            {...workspacePanelProps}
            immersive
            onLeaveStudio={leaveStudio}
          />
        </div>
      ) : (
      <div className={`flex min-h-0 flex-1 ${split ? "flex-col lg:flex-row" : ""}`}>
        <section
          className={`relative flex min-h-0 flex-col ${
            split
              ? "order-2 min-h-[38vh] flex-1 lg:order-1 lg:min-h-0 lg:w-[38%] lg:border-r lg:border-[var(--okapi-stroke)]"
              : "w-full"
          }`}
        >
          <div
            className={`scrollbar-thin mx-auto flex w-full flex-1 flex-col overflow-y-auto ${
              split
                ? "max-w-xl px-3 pb-3 pt-3"
                : "max-w-2xl items-stretch px-4 py-8 text-left lg:px-8"
            }`}
          >
            {!split ? (
              <div className="fade-up mb-2 flex w-full flex-col items-start">
                <div className="mb-4 flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-2xl ring-1 ring-[var(--okapi-stroke)]">
                    <Image
                      src="/okapi-logo.png"
                      alt="Okapi"
                      fill
                      sizes="48px"
                      className="object-cover object-[48%_26%]"
                      priority
                    />
                  </div>
                  <div>
                    <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight sm:text-3xl">
                      {greeting}, {displayName}
                    </h1>
                    <p className="mt-1 text-sm text-okapi-ink/50">
                      {agentLane === "creer"
                        ? "Décris l’app à créer — Preview ici, Studio seulement si tu l’ouvres."
                        : "Questions, conseils, contenus — Okapi peut se tromper."}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-okapi-ink/35">
                  Conversation
                </span>
              </div>
            )}

            {messageListBlock ? (
              <div className={`w-full ${split ? "" : "max-w-2xl"}`}>
                {messageListBlock}
              </div>
            ) : null}

            {renderPromptForm(split)}
          </div>
        </section>

        {split ? (
          <div className="order-1 flex min-h-[42vh] min-w-0 flex-col border-b border-[var(--okapi-stroke)] lg:order-2 lg:min-h-0 lg:flex-1 lg:border-b-0">
            <WorkspacePanel {...workspacePanelProps} />
          </div>
        ) : null}
      </div>
      )}
    </main>
  );
}
