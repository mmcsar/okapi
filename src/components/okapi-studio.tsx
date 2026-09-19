"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  DEFAULT_STUDIO_FILE_ID,
  STUDIO_GROUP_LABEL,
  buildStudioFileRows,
  type StudioFileGroup,
  type StudioFileId,
} from "@/lib/studio-files";
import { wantsStudioScaffold } from "@/lib/fullstack";
import { useOkapiPreviewBridge } from "@/hooks/use-okapi-preview-bridge";
import {
  OKAPI_PREVIEW_SANDBOX,
  injectOkapiRuntime,
  resolveOkapiCloudStatus,
  studioStackHints,
} from "@/lib/okapi-runtime";
import {
  OKAPI_AGENTS,
  type OkapiAgentId,
  resolveOkapiAgent,
} from "@/lib/studio-agents";
import {
  analyzeStudioProblems,
  buildMultiProblemFixPrompt,
  buildProblemFixPrompt,
  countStudioProblemBadge,
  type StudioProblem,
} from "@/lib/studio-problems";
import {
  configureMonacoStudio,
  monacoMarkersToProblems,
  studioFilePath,
} from "@/lib/monaco-studio";
import { readStudioStream } from "@/lib/studio-stream";
import type { OnMount } from "@monaco-editor/react";

export type { StudioFileId } from "@/lib/studio-files";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="okapi-studio-shell flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--okapi-studio-muted)]">
      <span className="h-8 w-8 animate-pulse rounded-lg bg-[#1b4f3a]/40" />
      Chargement Okapi Studio…
    </div>
  ),
});

type StudioFile = {
  id: StudioFileId;
  label: string;
  language: string;
  badge: string;
  group: StudioFileGroup;
  value: string;
  emptyHint: string;
};

type OkapiStudioProps = {
  title: string;
  html: string | null;
  react: string | null;
  reactNative: string | null;
  nextjs: string | null;
  packageJson: string | null;
  sql: string | null;
  api: string | null;
  python: string | null;
  requirements: string | null;
  flutter: string | null;
  pubspec: string | null;
  readme: string | null;
  showPreview: boolean;
  engine?: string;
  /** Secteur Accueil (aide à choisir l’agent métier) */
  sector?: string;
  projectId?: string | null;
  accessToken?: string | null;
  /** Bump after Accueil generate to inject chat continuity */
  seedKey?: number;
  seedMessages?: { role: "user" | "assistant"; content: string }[];
  onChangeFile: (id: StudioFileId, value: string) => void;
  onCommitted?: (fileId: StudioFileId, content: string) => void;
  onSaveCloud?: (opts?: { silent?: boolean }) => void | Promise<boolean>;
  /** Nouveau projet vide (parent efface les artefacts) */
  onNewProject?: () => void;
};

type AiMsg = { role: "user" | "assistant"; content: string };

type PendingEdit = {
  fileId: StudioFileId;
  before: string;
  after: string;
  note: string;
};

type TermLine = {
  t: string;
  kind: "info" | "ok" | "err" | "cmd";
};

type TermTab = "problems" | "output" | "terminal";

function countLines(text: string) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

type DiffLine = { type: "add" | "del" | "ctx"; text: string };

/** Diff ligne compact pour la carte Agent (pas un vrai Myers, suffisant UX). */
function roughLineDiff(before: string, after: string, max = 24): DiffLine[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while ((i < a.length || j < b.length) && out.length < max) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      if (out.length > 0 && out[out.length - 1]?.type !== "ctx") {
        out.push({ type: "ctx", text: a[i] });
      }
      i += 1;
      j += 1;
      continue;
    }
    if (
      j < b.length &&
      (i >= a.length || a.slice(i, i + 4).indexOf(b[j]) === -1)
    ) {
      out.push({ type: "add", text: b[j] ?? "" });
      j += 1;
      continue;
    }
    if (i < a.length) {
      out.push({ type: "del", text: a[i] ?? "" });
      i += 1;
      continue;
    }
    out.push({ type: "add", text: b[j] ?? "" });
    j += 1;
  }
  return out;
}

function diffStats(before: string, after: string) {
  const lines = roughLineDiff(before, after, 800);
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === "add") added += 1;
    if (line.type === "del") removed += 1;
  }
  return { added, removed };
}

const MONACO_FONT =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function monacoReviewOptions(readOnly: boolean) {
  return {
    readOnly,
    fontSize: 13,
    fontFamily: MONACO_FONT,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: "on" as const,
    tabSize: 2,
    padding: { top: 12, bottom: 12 },
    renderLineHighlight: "none" as const,
    lineNumbers: "on" as const,
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    renderWhitespace: "none" as const,
  };
}

function previewSlug(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "projet";
}

function IconExplorer({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 7h7l2 2h9v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function IconSpark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
  );
}

function IconPreview({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 8h18" />
    </svg>
  );
}

function IconTerminal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3M11 15h5" />
    </svg>
  );
}

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 12a8 8 0 0113.5-5.7M20 12a8 8 0 01-13.5 5.7" />
      <path d="M17 6.3V2h4M7 17.7V22H3" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function OkapiStudio({
  title,
  html,
  react,
  reactNative,
  nextjs,
  packageJson,
  sql,
  api,
  python,
  requirements,
  flutter,
  pubspec,
  readme,
  showPreview: _showPreview,
  engine = "flash",
  sector = "Général",
  projectId = null,
  accessToken = null,
  seedKey = 0,
  seedMessages,
  onChangeFile,
  onCommitted,
  onSaveCloud,
  onNewProject,
}: OkapiStudioProps) {
  const files = useMemo<StudioFile[]>(
    () =>
      buildStudioFileRows({
        html,
        react,
        reactNative,
        nextjs,
        packageJson,
        sql,
        api,
        python,
        requirements,
        flutter,
        pubspec,
        readme,
      }),
    [
      html,
      react,
      reactNative,
      nextjs,
      packageJson,
      sql,
      api,
      python,
      requirements,
      flutter,
      pubspec,
      readme,
    ],
  );

  const [activeId, setActiveId] = useState<StudioFileId>(DEFAULT_STUDIO_FILE_ID);
  const [openTabs, setOpenTabs] = useState<StudioFileId[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [quickIndex, setQuickIndex] = useState(0);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [cmdIndex, setCmdIndex] = useState(0);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<StudioFileId>>(() => new Set());
  /** Fichiers ouverts à la main (Ctrl+P) même encore vides. */
  const [pinnedIds, setPinnedIds] = useState<Set<StudioFileId>>(() => new Set());
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [termCmd, setTermCmd] = useState("");
  const [termHeight, setTermHeight] = useState(200);
  const termInputRef = useRef<HTMLInputElement>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [termTab, setTermTab] = useState<TermTab>("terminal");
  const [serverRunning, setServerRunning] = useState(false);
  const [termLines, setTermLines] = useState<TermLine[]>([
    {
      t: "Windows PowerShell · Okapi Studio",
      kind: "info",
    },
    {
      t: "Copyright (c) MMC SARL. Tape help · npm run dev pour lancer le serveur.",
      kind: "info",
    },
  ]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<OkapiAgentId>("general");
  const [aiProgress, setAiProgress] = useState<{
    message: string;
    step: number;
    total: number;
  } | null>(null);
  /** Code en train d’être écrit — visible dans l’Agent (comme Cursor). */
  const [aiLiveCode, setAiLiveCode] = useState("");
  const [aiLiveLabel, setAiLiveLabel] = useState("Code");
  const liveCodeEndRef = useRef<HTMLPreElement>(null);
  const [pendingList, setPendingList] = useState<PendingEdit[]>([]);
  const pending =
    pendingList.find((p) => p.fileId === activeId) ?? pendingList[0] ?? null;
  const [diffView, setDiffView] = useState<"after" | "before">("after");
  const [splitDiff, setSplitDiff] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const termEndRef = useRef<HTMLDivElement>(null);
  const serverTimersRef = useRef<number[]>([]);
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([
    {
      role: "assistant",
      content:
        "Coach Okapi prêt. Décris le projet — je génère tous les fichiers, ouvre le terminal PowerShell et lance le serveur Preview.",
    },
  ]);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
  const seenContentRef = useRef<Set<StudioFileId>>(new Set());
  const lastSeedKeyRef = useRef(0);

  const previewUrl = `okapi://preview/${previewSlug(title)}`;
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  useOkapiPreviewBridge(previewIframeRef, projectId);

  const cloudStatus = useMemo(
    () =>
      resolveOkapiCloudStatus({
        projectId,
        accessToken,
      }),
    [projectId, accessToken],
  );

  const stackHints = useMemo(
    () =>
      studioStackHints({
        nextjs,
        packageJson,
        flutter,
        pubspec,
        python,
        requirements,
      }),
    [nextjs, packageJson, flutter, pubspec, python, requirements],
  );

  const liveHtml = useMemo(() => {
    if (!html) return html;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return injectOkapiRuntime(html, {
      projectId: projectId ?? null,
      parentOrigin: origin,
    });
  }, [html, projectId]);

  // Quand le cloud ID arrive après Sauver, recharger la Preview (tableaux cloud).
  const prevProjectIdRef = useRef(projectId);
  useEffect(() => {
    const prev = prevProjectIdRef.current;
    prevProjectIdRef.current = projectId;
    if (projectId && projectId !== prev) {
      setPreviewKey((k) => k + 1);
    }
  }, [projectId]);

  const logTerm = useCallback((text: string, kind: TermLine["kind"] = "info") => {
    const stamp = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTermLines((prev) => [...prev, { t: `[${stamp}] ${text}`, kind }]);
  }, []);

  /** Après Accept : sauver pour brancher le cloud (Preview locale marche déjà). */
  const ensureCloudAfterAccept = useCallback(
    async (hadHtml: boolean) => {
      if (!onSaveCloud) return;
      if (!accessToken) {
        logTerm(
          "Mode invité · tableaux Preview en mémoire locale — Connexion + Sauver pour le cloud",
          "info",
        );
        setAiMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "✓ Preview active (mémoire locale) — ajoute un produit pour le voir dans le tableau.\nPour garder le projet et les données → Connexion, puis Sauver (Ctrl+S).",
          },
        ]);
        return;
      }
      if (projectId) {
        if (hadHtml) setPreviewKey((k) => k + 1);
        return;
      }
      // Laisse le debounce onCommitted finir d’écrire snapRef, puis force une save
      logTerm("Cloud · sauvegarde du projet…", "cmd");
      await new Promise((r) => window.setTimeout(r, 350));
      const ok = await onSaveCloud({ silent: true });
      if (ok) {
        logTerm("Cloud · projet sauvé — visible dans Mes projets", "ok");
        setAiMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "✓ Projet sauvegardé. Retrouve-le dans Mes projets. Tableaux Preview → cloud Okapi.",
          },
        ]);
        if (hadHtml) setPreviewKey((k) => k + 1);
      } else {
        logTerm(
          "Cloud · échec — clique Sauver ou Ctrl+S (vérifie la connexion)",
          "err",
        );
        setAiMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sauvegarde cloud échouée. Vérifie que tu es connecté, puis Sauver / Ctrl+S. La Preview locale reste utilisable.",
          },
        ]);
      }
    },
    [onSaveCloud, accessToken, projectId, logTerm],
  );

  useEffect(() => {
    if (!seedKey || seedKey === lastSeedKeyRef.current) return;
    lastSeedKeyRef.current = seedKey;
    setPendingList([]);
    setDirtyIds(new Set());
    if (!seedMessages?.length) {
      setAiMessages([
        {
          role: "assistant",
          content:
            "Nouveau projet. Décris l’app — Okapi génère les fichiers ici.",
        },
      ]);
      return;
    }
    const brief = seedMessages.find((m) => m.role === "user")?.content || "";
    const detected = resolveOkapiAgent({
      sector,
      instruction: brief,
    });
    setAgentId(detected.id);
    setAiMessages(
      seedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    );
    setAiOpen(true);
    // Preview reste fermé : Agent prioritaire ; ouvrir via activity bar
    setPreviewOpen(false);
    const stamp = new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setTermLines((prev) => [
      ...prev,
      {
        t: `[${stamp}] Pont Accueil → Studio · Agent ${detected.label}`,
        kind: "ok",
      },
    ]);
  }, [seedKey, seedMessages, html, sector]);

  useEffect(() => {
    const fromSector = resolveOkapiAgent({ sector });
    if (fromSector.id !== "general") setAgentId(fromSector.id);
  }, [sector]);

  const isFileVisible = useCallback(
    (f: StudioFile) =>
      Boolean(f.value.trim()) ||
      pendingList.some((p) => p.fileId === f.id) ||
      pinnedIds.has(f.id) ||
      dirtyIds.has(f.id),
    [pendingList, pinnedIds, dirtyIds],
  );

  const visibleFiles = useMemo(
    () => files.filter(isFileVisible),
    [files, isFileVisible],
  );

  const [monacoProblems, setMonacoProblems] = useState<StudioProblem[]>([]);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const syncMonacoProblems = useCallback(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    const model = editor.getModel();
    if (!model) {
      setMonacoProblems([]);
      return;
    }
    const fileId = activeIdRef.current;
    const lang = model.getLanguageId();
    if (
      lang !== "typescript" &&
      lang !== "javascript" &&
      lang !== "json"
    ) {
      setMonacoProblems([]);
      return;
    }
    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    setMonacoProblems(monacoMarkersToProblems(fileId, markers));
  }, []);

  const handleMonacoBeforeMount = useCallback((monaco: Parameters<OnMount>[1]) => {
    configureMonacoStudio(monaco);
  }, []);

  const handleMonacoMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      configureMonacoStudio(monaco);
      syncMonacoProblems();
      const sub = monaco.editor.onDidChangeMarkers(() => {
        syncMonacoProblems();
      });
      const sub2 = editor.onDidChangeModelContent(() => {
        // Worker updates markers async; light debounce via rAF
        requestAnimationFrame(() => syncMonacoProblems());
      });
      editor.onDidDispose(() => {
        sub.dispose();
        sub2.dispose();
        if (editorRef.current === editor) editorRef.current = null;
      });
    },
    [syncMonacoProblems],
  );

  useEffect(() => {
    // Re-read markers when switching files
    const t = window.setTimeout(() => syncMonacoProblems(), 120);
    return () => window.clearTimeout(t);
  }, [activeId, syncMonacoProblems]);

  const studioProblems = useMemo(() => {
    const heuristic = analyzeStudioProblems({
      html,
      react,
      nextjs,
      sql,
      api,
      pendingFileIds: pendingList.map((p) => p.fileId),
    });
    // Monaco covers TS/JS/JSON for the active buffer; keep heuristics for HTML/SQL/etc.
    const monacoFileIds = new Set(monacoProblems.map((p) => p.fileId));
    const filtered = heuristic.filter((h) => {
      if (!monacoFileIds.has(h.fileId)) return true;
      // Drop weak heuristic dupes on files Monaco already types
      return h.id.startsWith("pending-");
    });
    return [...filtered, ...monacoProblems];
  }, [html, react, nextjs, sql, api, pendingList, monacoProblems]);

  const problemsBadge = useMemo(
    () => countStudioProblemBadge(studioProblems),
    [studioProblems],
  );

  const active =
    files.find((f) => f.id === activeId) ??
    visibleFiles[0] ??
    files[0];

  const groups = useMemo(() => {
    const order: StudioFile["group"][] = ["web", "mobile", "data", "docs"];
    return order
      .map((g) => ({
        id: g,
        label: STUDIO_GROUP_LABEL[g],
        items: visibleFiles.filter((f) => f.group === g),
      }))
      .filter((g) => g.items.length > 0);
  }, [visibleFiles]);

  const quickMatches = useMemo(() => {
    const q = quickQuery.trim().toLowerCase();
    const pool = q ? files : visibleFiles.length ? visibleFiles : files;
    if (!q) return pool;
    return files.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        f.badge.toLowerCase().includes(q) ||
        STUDIO_GROUP_LABEL[f.group].toLowerCase().includes(q),
    );
  }, [files, visibleFiles, quickQuery]);

  const tabFiles = useMemo(
    () =>
      openTabs
        .map((id) => files.find((f) => f.id === id))
        .filter((f): f is StudioFile => Boolean(f && isFileVisible(f))),
    [openTabs, files, isFileVisible],
  );

  const pendingDiffLines = useMemo(() => {
    if (!pending) return [];
    return roughLineDiff(pending.before, pending.after, 20);
  }, [pending]);

  type StudioCmd = {
    id: string;
    label: string;
    hint: string;
    run: () => void;
  };

  const studioCommands = useMemo<StudioCmd[]>(() => {
    const list: StudioCmd[] = [
      {
        id: "agent",
        label: "Focus Agent Okapi",
        hint: "Ctrl+L",
        run: () => {
          setAiOpen(true);
          window.setTimeout(() => aiInputRef.current?.focus(), 60);
        },
      },
      {
        id: "quick",
        label: "Quick Open fichier",
        hint: "Ctrl+P",
        run: () => setQuickOpen(true),
      },
      {
        id: "terminal",
        label: "Basculer Terminal PowerShell",
        hint: "Ctrl+`",
        run: () =>
          setTerminalOpen((v) => {
            const next = !v;
            if (next) setTermTab("terminal");
            return next;
          }),
      },
      {
        id: "dev-server",
        label: "Lancer le serveur (npm run dev)",
        hint: "serve",
        run: () => bootOkapiDevServer({ force: true }),
      },
      {
        id: "preview",
        label: "Basculer Preview",
        hint: "",
        run: () => setPreviewOpen((v) => !v),
      },
      {
        id: "explorer",
        label: "Basculer Explorateur",
        hint: "Ctrl+B",
        run: () => setExplorerOpen((v) => !v),
      },
      {
        id: "split-diff",
        label: "Diff côte à côte / simple",
        hint: "diff",
        run: () => setSplitDiff((v) => !v),
      },
      {
        id: "shortcuts",
        label: "Voir les raccourcis",
        hint: "Ctrl+Shift+/",
        run: () => setHelpOpen(true),
      },
      {
        id: "accept-all",
        label: "Accepter tout le projet",
        hint: pendingList.length > 1 ? `${pendingList.length} fichiers` : "—",
        run: () => {
          if (pendingList.length > 0) acceptAllPending();
        },
      },
      {
        id: "accept",
        label: "Accepter le fichier courant",
        hint: pending ? "actif" : "—",
        run: () => {
          if (pending) acceptPending();
        },
      },
      {
        id: "reject",
        label: "Refuser le diff",
        hint: "Esc",
        run: () => {
          if (pending) rejectPending();
        },
      },
      {
        id: "clear-term",
        label: "Vider le Terminal",
        hint: "clear",
        run: () => {
          setTermLines([
            {
              t: "Terminal vidé.",
              kind: "info",
            },
          ]);
          setTerminalOpen(true);
          setTermTab("terminal");
        },
      },
    ];
    if (onSaveCloud) {
      list.push({
        id: "save",
        label: "Sauvegarder cloud",
        hint: "Ctrl+S",
        run: () => {
          void (async () => {
            const ok = await onSaveCloud?.();
            if (ok) {
              setDirtyIds(new Set());
              logTerm("Sauvegarde cloud OK", "ok");
            } else {
              logTerm("Sauvegarde cloud échouée ou en cours", "err");
            }
          })();
        },
      });
    }
    if (onNewProject) {
      list.push({
        id: "new-project",
        label: "Nouveau projet",
        hint: "vider workspace",
        run: () => onNewProject(),
      });
    }
    return list;
    // acceptPending/rejectPending via closure at click time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, pendingList.length, onSaveCloud, onNewProject, logTerm, html, title]);

  const cmdMatches = useMemo(() => {
    const q = cmdQuery.trim().toLowerCase();
    if (!q) return studioCommands;
    return studioCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.id.includes(q) ||
        c.hint.toLowerCase().includes(q),
    );
  }, [studioCommands, cmdQuery]);

  useEffect(() => {
    const withContent = files.filter((f) => f.value.trim()).map((f) => f.id);
    const preferred = withContent[0] ?? null;

    setOpenTabs((prev) => {
      const kept = prev.filter((id) => {
        const f = files.find((x) => x.id === id);
        return f ? isFileVisible(f) : false;
      });
      // Premier contenu d’un fichier → ouvrir l’onglet une fois
      for (const id of withContent) {
        if (!seenContentRef.current.has(id)) {
          seenContentRef.current.add(id);
          if (!kept.includes(id)) kept.push(id);
        }
      }
      for (const p of pendingList) {
        if (!kept.includes(p.fileId)) kept.push(p.fileId);
      }
      if (kept.length === 0 && preferred) return [preferred];
      return kept;
    });

    setActiveId((prev) => {
      const cur = files.find((f) => f.id === prev);
      if (cur && isFileVisible(cur)) return prev;
      return preferred ?? prev;
    });
  }, [files, pendingList, isFileVisible]);

  const aiProgressKey = aiProgress
    ? `${aiProgress.step}/${aiProgress.total}:${aiProgress.message}`
    : "";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, aiBusy, aiProgressKey, aiLiveCode]);

  useEffect(() => {
    liveCodeEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [aiLiveCode]);

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [termLines, terminalOpen]);

  useEffect(() => {
    if (terminalOpen && termTab === "terminal") {
      const t = window.setTimeout(() => termInputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [terminalOpen, termTab]);

  function openTerminal(tab: TermTab = "terminal") {
    setTermTab(tab);
    setTerminalOpen(true);
  }

  function clearServerTimers() {
    for (const id of serverTimersRef.current) window.clearTimeout(id);
    serverTimersRef.current = [];
  }

  function scheduleTerm(delay: number, text: string, kind: TermLine["kind"] = "info") {
    const id = window.setTimeout(() => logTerm(text, kind), delay);
    serverTimersRef.current.push(id);
  }

  /** Lance le « serveur » Okapi (Preview) — UX type npm run dev / PowerShell. */
  function bootOkapiDevServer(opts?: { force?: boolean }) {
    const hasHtml = Boolean(html?.trim());
    openTerminal("terminal");
    clearServerTimers();

    const projectName = (title || "okapi-app")
      .replace(/[^\w\-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "okapi-app";
    const cwd = `C:\\Users\\Okapi\\projects\\${projectName}`;

    logTerm(`PS ${cwd}> npm run dev`, "cmd");

    if (!hasHtml && !opts?.force) {
      scheduleTerm(200, "error: aucun app.html — demande un projet à l’Agent d’abord", "err");
      setServerRunning(false);
      return;
    }

    setServerRunning(true);
    scheduleTerm(280, "", "info");
    scheduleTerm(320, "> okapi-preview@1.0.0 dev", "info");
    scheduleTerm(480, "> okapi serve --preview", "info");
    scheduleTerm(720, "", "info");
    scheduleTerm(900, "▲ Okapi Preview 16.x (Turbopack)", "ok");
    scheduleTerm(1100, `- Local:        ${previewUrl}`, "ok");
    scheduleTerm(1280, `- Network:      http://127.0.0.1:3000`, "info");
    scheduleTerm(1450, "✓ Ready in 1.2s", "ok");
    scheduleTerm(1600, "○ Compiling / …", "info");

    const openId = window.setTimeout(() => {
      setPreviewOpen(true);
      setPreviewKey((k) => k + 1);
      logTerm("✓ Preview ouverte — serveur Okapi actif", "ok");
      logTerm(`PS ${cwd}>`, "cmd");
    }, 1750);
    serverTimersRef.current.push(openId);
  }

  function stopOkapiDevServer() {
    clearServerTimers();
    setServerRunning(false);
    logTerm("^C", "cmd");
    logTerm("Serveur Okapi arrêté.", "info");
  }

  function runTermCommand(raw: string) {
    const line = raw.trim();
    if (!line) return;
    const projectName = (title || "okapi-app")
      .replace(/[^\w\-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "okapi-app";
    const cwd = `C:\\Users\\Okapi\\projects\\${projectName}`;
    logTerm(`PS ${cwd}> ${line}`, "cmd");
    setTermCmd("");

    const lower = line.toLowerCase();
    const parts = line.split(/\s+/);
    const c0 = (parts[0] || "").toLowerCase();
    const c1 = (parts[1] || "").toLowerCase();
    const c2 = (parts[2] || "").toLowerCase();

    // PowerShell / shell basics
    if (c0 === "help" || c0 === "?" || lower === "get-help") {
      logTerm(
        "PowerShell Okapi : npm run dev · npm start · npx serve · preview · stop · agent · open <fichier> · dir · pwd · clear · accept · reject",
        "info",
      );
      return;
    }
    if (c0 === "clear" || c0 === "cls" || lower === "clear-host") {
      setTermLines([
        {
          t: "Windows PowerShell · Okapi Studio — écran effacé.",
          kind: "info",
        },
      ]);
      return;
    }
    if (c0 === "pwd" || lower === "get-location") {
      logTerm(cwd, "ok");
      return;
    }
    if (c0 === "dir" || c0 === "ls" || lower === "get-childitem") {
      const listed = files.filter((f) => f.value.trim() || pinnedIds.has(f.id));
      if (listed.length === 0) {
        logTerm("(vide) — génère un projet avec l’Agent", "info");
        return;
      }
      for (const f of listed) {
        logTerm(
          `${String(countLines(f.value)).padStart(6)}  ${f.label}`,
          "info",
        );
      }
      return;
    }
    if (c0 === "cd") {
      logTerm(`Set-Location : reste dans ${cwd} (sandbox Okapi)`, "info");
      return;
    }
    if (c0 === "echo" || c0 === "write-host") {
      logTerm(parts.slice(1).join(" ") || "", "info");
      return;
    }
    if (c0 === "powershell" || c0 === "pwsh" || c0 === "cmd") {
      logTerm("Shell Okapi déjà actif (PowerShell).", "ok");
      logTerm("Lance le serveur : npm run dev", "info");
      return;
    }

    // Dev server
    if (
      lower === "npm run dev" ||
      lower === "npm start" ||
      lower === "npm run start" ||
      lower === "yarn dev" ||
      lower === "pnpm dev" ||
      lower === "npx serve" ||
      lower === "npx vite" ||
      lower === "node server" ||
      c0 === "serve" ||
      (c0 === "npx" && (c1 === "serve" || c1 === "vite")) ||
      (c0 === "npm" && c1 === "run" && (c2 === "dev" || c2 === "start"))
    ) {
      bootOkapiDevServer({ force: true });
      return;
    }
    if (
      lower === "stop" ||
      lower === "npm run stop" ||
      lower === "kill" ||
      lower === "exit"
    ) {
      if (serverRunning) stopOkapiDevServer();
      else logTerm("Aucun serveur en cours.", "info");
      return;
    }

    if (c0 === "status") {
      logTerm(
        `Projet « ${title || "Okapi"} » · @${active.label} · ${lineCount} ln · serveur ${serverRunning ? "ON" : "OFF"} · agent ${aiOpen ? "ouvert" : "fermé"}`,
        "ok",
      );
      return;
    }
    if (c0 === "preview") {
      setPreviewOpen(true);
      setPreviewKey((k) => k + 1);
      logTerm("Preview ouverte / actualisée", "ok");
      return;
    }
    if (c0 === "agent") {
      setAiOpen(true);
      logTerm("Agent Okapi focus (Ctrl+L)", "ok");
      window.setTimeout(() => aiInputRef.current?.focus(), 80);
      return;
    }
    if (c0 === "accept") {
      if (!pending) {
        logTerm("Aucun diff en attente", "info");
        return;
      }
      acceptPending();
      return;
    }
    if (c0 === "reject") {
      if (!pending) {
        logTerm("Aucun diff en attente", "info");
        return;
      }
      rejectPending();
      return;
    }
    if (c0 === "open" || c0 === "code") {
      const arg = parts.slice(1).join(" ").trim().toLowerCase();
      const match = files.find(
        (f) =>
          f.id.toLowerCase() === arg ||
          f.label.toLowerCase() === arg ||
          f.label.toLowerCase().includes(arg),
      );
      if (!match || !arg) {
        logTerm(
          `Fichiers : ${files.map((f) => f.label).join(" · ")}`,
          "info",
        );
        return;
      }
      openFile(match.id);
      logTerm(`Ouvert ${match.label}`, "ok");
      return;
    }
    if (c0 === "node" || c0 === "npm" || c0 === "npx" || c0 === "yarn") {
      logTerm(
        `okapi: '${line}' — pour le serveur Preview utilise : npm run dev`,
        "err",
      );
      return;
    }
    logTerm(
      `okapi: La commande « ${c0} » n’est pas reconnue. Tape help`,
      "err",
    );
  }

  const editorValue =
    pending && pending.fileId === active.id
      ? diffView === "before"
        ? pending.before
        : pending.after
      : active.value;

  const lineCount = countLines(editorValue);
  const hasPendingHere = Boolean(pending && pending.fileId === active.id);

  useEffect(() => {
    return () => {
      for (const id of serverTimersRef.current) window.clearTimeout(id);
      serverTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!quickOpen) return;
    setQuickQuery("");
    setQuickIndex(0);
    const t = window.setTimeout(() => quickInputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [quickOpen]);

  useEffect(() => {
    setQuickIndex(0);
  }, [quickQuery]);

  useEffect(() => {
    if (!cmdOpen) return;
    setCmdQuery("");
    setCmdIndex(0);
    const t = window.setTimeout(() => cmdInputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [cmdOpen]);

  useEffect(() => {
    setCmdIndex(0);
  }, [cmdQuery]);

  function markDirty(id: StudioFileId) {
    setDirtyIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function clearDirty(id: StudioFileId) {
    setDirtyIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function runStudioCommand(cmd: StudioCmd) {
    setCmdOpen(false);
    cmd.run();
  }

  function openFile(id: StudioFileId) {
    setPinnedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setActiveId(id);
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuickOpen(false);
    const file = files.find((f) => f.id === id);
    logTerm(`Ouverture ${file?.label ?? id}`, "cmd");
  }

  function openProblem(problem: StudioProblem) {
    openFile(problem.fileId);
    setTerminalOpen(true);
    setTermTab("problems");
    logTerm(
      `Problems · ${problem.severity} · ${problem.fileId}: ${problem.message}`,
      problem.severity === "error" ? "err" : "info",
    );
  }

  function closeTab(id: StudioFileId) {
    setOpenTabs((prev) => {
      const next = prev.filter((x) => x !== id);
      if (next.length === 0) {
        const fallback =
          visibleFiles.find((f) => f.id !== id)?.id ??
          files.find((f) => f.value.trim() && f.id !== id)?.id;
        if (fallback) {
          setActiveId(fallback);
          return [fallback];
        }
        setActiveId(DEFAULT_STUDIO_FILE_ID);
        return [];
      }
      if (activeId === id) {
        const idx = prev.indexOf(id);
        setActiveId(next[Math.max(0, idx - 1)] ?? next[0]!);
      }
      return next;
    });
  }

  function refreshPreview() {
    setPreviewKey((k) => k + 1);
    logTerm("Preview actualisée", "info");
  }

  async function askStudioAi(
    e?: FormEvent,
    opts?: {
      instruction?: string;
      fileId?: StudioFileId;
      forceEdit?: boolean;
    },
  ) {
    e?.preventDefault();
    const instruction = (opts?.instruction ?? aiPrompt).trim();
    if (!instruction || aiBusy) return;

    const target =
      files.find((f) => f.id === (opts?.fileId ?? activeId)) ?? active;

    const activeAgent = resolveOkapiAgent({
      agentId,
      sector,
      instruction,
    });
    if (activeAgent.id !== agentId) setAgentId(activeAgent.id);

    // Nouvelle demande = on laisse tomber les diffs non acceptés
    if (pendingList.length > 0) {
      setPendingList([]);
      logTerm("Diffs précédents annulés (nouvelle demande)", "info");
    }

    setAiBusy(true);
    setAiError(null);
    setAiProgress(null);
    setAiLiveCode("");
    if (!opts?.instruction) setAiPrompt("");
    setAiMessages((prev) => [...prev, { role: "user", content: instruction }]);
    logTerm(`Agent ${activeAgent.label} · ${activeAgent.short}`, "cmd");

    const asProject =
      !opts?.forceEdit &&
      wantsStudioScaffold(instruction, {
        hasExistingFiles: visibleFiles.some((f) => f.value.trim()),
      });
    setAiLiveLabel(asProject ? "Projet · stream" : `Édit · ${target.label}`);

    // Contexte multi-fichiers + historique Agent (envoyé aux APIs Studio)
    const workspacePayload = files
      .filter((f) => f.value.trim())
      .map((f) => ({
        fileId: f.id,
        label: f.label,
        content: f.value,
      }));
    const historyPayload = [
      ...aiMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-5)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      { role: "user" as const, content: instruction },
    ].slice(-6);

    try {
      if (asProject) {
        logTerm(`Coach · grand projet multi-fichiers…`, "cmd");
        setAiProgress({
          message: "Okapi planifie le projet…",
          step: 1,
          total: 4,
        });
        setAiMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Je construis le projet — le code défile ici en direct (comme Cursor).",
          },
        ]);

        const res = await fetch("/api/studio-project", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : {}),
          },
          body: JSON.stringify({
            instruction,
            engine,
            title: title || undefined,
            agentId: activeAgent.id,
            sector,
            workspace: workspacePayload,
            history: historyPayload,
            stream: true,
          }),
        });

        if (!res.ok) {
          const fail = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(fail?.error || "Génération projet impossible.");
        }

        const contentType = res.headers.get("content-type") || "";
        let data: {
          title?: string;
          note?: string;
          large?: boolean;
          repaired?: boolean;
          files?: { fileId: StudioFileId; content: string }[];
        };

        if (contentType.includes("ndjson") || contentType.includes("x-ndjson")) {
          const done = await readStudioStream(res, (event) => {
            if (event.type === "status") {
              setAiProgress({
                message: event.message,
                step: event.step ?? 1,
                total: event.total ?? 4,
              });
              logTerm(event.message, event.repairing ? "ok" : "cmd");
            } else if (event.type === "delta") {
              setAiLiveCode((prev) => (prev + event.text).slice(-14_000));
            } else if (event.type === "file") {
              setAiLiveLabel(`Fichier · ${event.fileId}`);
            }
          });
          data = done;
        } else {
          const json = (await res.json().catch(() => null)) as typeof data & {
            error?: string;
          } | null;
          if (!json?.files?.length) {
            throw new Error(json?.error || "Génération projet impossible.");
          }
          data = json;
        }

        if (!data.files?.length) {
          throw new Error("Génération projet impossible.");
        }

        const batch: PendingEdit[] = data.files.map((f) => {
          const current = files.find((x) => x.id === f.fileId);
          return {
            fileId: f.fileId,
            before: current?.value ?? "",
            after: f.content,
            note: data.note || `Fichier ${f.fileId}`,
          };
        });

        if (data.repaired) {
          logTerm("Coach · auto-correction du scaffold appliquée", "ok");
        }

        setAiProgress(null);
        setAiLiveCode("");
        deliverProjectBatch(batch, {
          note: data.note,
          large: Boolean(data.large),
        });
        return;
      }

      logTerm(`IA · édition demandée sur ${target.label}…`, "cmd");
      setAiProgress({
        message: `Écriture de ${target.label}…`,
        step: 1,
        total: 2,
      });
      const res = await fetch("/api/studio-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {}),
        },
        body: JSON.stringify({
          instruction,
          fileId: target.id,
          fileLabel: target.label,
          language: target.language,
          content: target.value,
          engine,
          agentId: activeAgent.id,
          sector,
          workspace: workspacePayload,
          history: historyPayload,
          stream: true,
        }),
      });

      if (!res.ok) {
        const fail = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(fail?.error || "Édition impossible.");
      }

      const editCt = res.headers.get("content-type") || "";
      let data: {
        content?: string;
        note?: string;
        multi?: boolean;
        files?: { fileId: StudioFileId; content: string }[];
        error?: string;
      } | null;

      if (editCt.includes("ndjson") || editCt.includes("x-ndjson")) {
        const done = await readStudioStream(res, (event) => {
          if (event.type === "status") {
            setAiProgress({
              message: event.message,
              step: event.step ?? 1,
              total: event.total ?? 2,
            });
            logTerm(event.message, "cmd");
          } else if (event.type === "delta") {
            setAiLiveCode((prev) => (prev + event.text).slice(-14_000));
          } else if (event.type === "file") {
            setAiLiveLabel(`Fichier · ${event.fileId}`);
          }
        });
        data = {
          note: done.note,
          multi: done.multi,
          files: done.files,
          content: done.files[0]?.content,
        };
      } else {
        setAiProgress({
          message: "Préparation des diffs…",
          step: 2,
          total: 2,
        });
        data = (await res.json().catch(() => null)) as typeof data;
        if (!data || data.error) {
          throw new Error(data?.error || "Édition impossible.");
        }
      }

      setAiLiveCode("");

      const edits: PendingEdit[] = (
        data?.files?.length
          ? data.files
          : data?.content
            ? [{ fileId: target.id, content: data.content }]
            : []
      )
        .map((f) => {
          const current = files.find((x) => x.id === f.fileId);
          const before = current?.value ?? "";
          if (f.content === before) return null;
          return {
            fileId: f.fileId,
            before,
            after: f.content,
            note: data?.note || `Proposition pour ${f.fileId}`,
          } satisfies PendingEdit;
        })
        .filter((x): x is PendingEdit => Boolean(x));

      if (edits.length === 0) {
        setAiMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Aucun changement détecté." },
        ]);
        logTerm("IA · aucun changement détecté", "info");
        return;
      }

      setPendingList(edits);
      setOpenTabs((prev) => {
        const merged = [...prev];
        for (const e of edits) {
          if (!merged.includes(e.fileId)) merged.push(e.fileId);
        }
        return merged;
      });
      setActiveId(edits[0]!.fileId);
      setDiffView("after");
      setSplitDiff(true);
      setAiOpen(true);

      const names = edits.map((e) => e.fileId).join(", ");
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            edits.length > 1
              ? `${data?.note || "Proposition multi-fichiers."} ${edits.length} fichiers : ${names}. Accepte un par un, Tout (Ctrl+Enter), ou continue à discuter.`
              : `${data?.note || "Proposition prête."} Vérifie le diff, puis Accepte ou Refuse.`,
        },
      ]);
      logTerm(
        edits.length > 1
          ? `Diff multi · ${edits.length} fichiers (${names})`
          : `Diff prêt · ${edits[0]!.fileId} (${countLines(edits[0]!.before)} → ${countLines(edits[0]!.after)} lignes)`,
        "ok",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur IA Studio";
      setAiError(msg);
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `${msg}\n\nAstuce: depuis Agent Accueil, colle le même brief — Preview plus rapide, puis Continuer dans Studio.`,
        },
      ]);
      logTerm(`Erreur IA · ${msg}`, "err");
      setTerminalOpen(true);
      setTermTab("terminal");
    } finally {
      setAiBusy(false);
      setAiProgress(null);
      setAiLiveCode("");
    }
  }

  function fixProblem(problem: StudioProblem) {
    if (aiBusy) return;
    if (problem.id.startsWith("pending-")) {
      openProblem(problem);
      setAiOpen(true);
      return;
    }
    openFile(problem.fileId);
    setAiOpen(true);
    setTerminalOpen(true);
    setTermTab("problems");
    logTerm(`Fix Agent · ${problem.fileId}`, "cmd");
    void askStudioAi(undefined, {
      instruction: buildProblemFixPrompt(problem),
      fileId: problem.fileId,
      forceEdit: true,
    });
  }

  function fixAllProblems() {
    if (aiBusy) return;
    const fixable = studioProblems.filter(
      (p) =>
        (p.severity === "error" || p.severity === "warning") &&
        !p.id.startsWith("pending-"),
    );
    if (fixable.length === 0) return;
    openFile(fixable[0]!.fileId);
    setAiOpen(true);
    setTerminalOpen(true);
    setTermTab("problems");
    logTerm(`Fix Agent · ${fixable.length} problèmes`, "cmd");
    void askStudioAi(undefined, {
      instruction: buildMultiProblemFixPrompt(fixable),
      fileId: fixable[0]!.fileId,
      forceEdit: true,
    });
  }

  function deliverProjectBatch(
    batch: PendingEdit[],
    opts?: { note?: string; large?: boolean },
  ) {
    if (batch.length === 0) return;
    let hadHtml = false;
    for (const item of batch) {
      onChangeFile(item.fileId, item.after);
      onCommitted?.(item.fileId, item.after);
      clearDirty(item.fileId);
      seenContentRef.current.add(item.fileId);
      if (item.fileId === "app.html") hadHtml = true;
    }
    const n = batch.length;
    const ids = batch.map((b) => b.fileId);
    setPendingList([]);
    setOpenTabs((prev) => {
      const merged = [...prev];
      for (const id of ids) {
        if (!merged.includes(id)) merged.push(id);
      }
      return merged;
    });
    const preferHtml = batch.find((b) => b.fileId === "app.html");
    setActiveId(preferHtml?.fileId ?? batch[0]!.fileId);
    setDiffView("after");
    setAiOpen(true);
    const names = ids.slice(0, 6).join(", ") + (ids.length > 6 ? "…" : "");
    setAiMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: [
          opts?.note || "Projet livré.",
          `✓ ${n} fichier${n > 1 ? "s" : ""} dans Monaco${
            opts?.large ? " · grand projet" : ""
          }.`,
          names ? `(${names})` : "",
          hadHtml
            ? "Preview en cours — ajoute une ligne dans le formulaire pour remplir le tableau."
            : "Dis la suite — ou lance npm run dev quand tu auras du HTML.",
        ]
          .filter(Boolean)
          .join(" "),
      },
    ]);
    logTerm(`Livré · ${n} fichiers (Studio Okapi)`, "ok");
    // Sauver d’abord (cloud), puis lancer Preview — évite tableaux vides sans projectId.
    void (async () => {
      await ensureCloudAfterAccept(hadHtml);
      if (hadHtml) {
        bootOkapiDevServer();
      } else {
        openTerminal("terminal");
        logTerm("Projet prêt — génère app.html puis : npm run dev", "info");
      }
    })();
    window.setTimeout(() => aiInputRef.current?.focus(), 80);
  }

  function acceptPending() {
    if (!pending) return;
    onChangeFile(pending.fileId, pending.after);
    const wasHtml = pending.fileId === "app.html";
    const { fileId, after } = pending;
    clearDirty(fileId);
    seenContentRef.current.add(fileId);
    onCommitted?.(fileId, after);

    const remaining = pendingList.filter((p) => p.fileId !== fileId);
    setPendingList(remaining);

    if (remaining.length === 0) {
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✓ ${fileId} accepté.${
            wasHtml ? " Preview dispo." : ""
          } Dis la suite — je continue.`,
        },
      ]);
      if (wasHtml) {
        void (async () => {
          await ensureCloudAfterAccept(true);
          bootOkapiDevServer();
        })();
      } else {
        void ensureCloudAfterAccept(false);
      }
    } else {
      setActiveId(remaining[0]!.fileId);
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✓ ${fileId} accepté. Reste ${remaining.length} — Accepte tout (Ctrl+Enter) ou continue.`,
        },
      ]);
    }
    logTerm(`Accepté · ${fileId}`, "ok");
    window.setTimeout(() => aiInputRef.current?.focus(), 80);
  }

  function acceptAllPending() {
    if (pendingList.length === 0) return;
    deliverProjectBatch([...pendingList], { note: "Projet appliqué." });
  }

  function rejectPending() {
    if (pendingList.length === 0) return;
    const n = pendingList.length;
    setPendingList([]);
    setDiffView("after");
    setAiMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          n > 1
            ? `Projet refusé (${n} fichiers). Reformule et je régénère.`
            : `Proposition refusée. Reformule et je réessaie.`,
      },
    ]);
    logTerm(`Refusé · ${n} proposition(s)`, "info");
    window.setTimeout(() => aiInputRef.current?.focus(), 80);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // Ctrl+` — toggle terminal
      if (meta && (e.key === "`" || e.code === "Backquote")) {
        e.preventDefault();
        setTerminalOpen((v) => {
          const next = !v;
          if (next) setTermTab("terminal");
          return next;
        });
        return;
      }
      // Ctrl+P — Quick Open (sans Shift)
      if (meta && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setQuickOpen(true);
        return;
      }
      // Ctrl+Shift+P — Command Palette
      if (meta && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }
      // Ctrl+B — explorateur
      if (meta && e.key.toLowerCase() === "b" && !typing) {
        e.preventDefault();
        setExplorerOpen((v) => !v);
        return;
      }
      // Ctrl+Shift+/ ou Ctrl+/ — raccourcis
      if (meta && (e.key === "/" || e.key === "?")) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && helpOpen) {
        e.preventDefault();
        setHelpOpen(false);
        return;
      }
      // Ctrl+S — save cloud
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (onSaveCloud) {
          void (async () => {
            const ok = await onSaveCloud();
            if (ok) {
              setDirtyIds(new Set());
              logTerm("Sauvegarde cloud (Ctrl+S) OK", "ok");
            } else {
              logTerm("Sauvegarde cloud échouée ou en cours", "err");
            }
          })();
        } else {
          logTerm("Sauvegarde cloud indisponible", "info");
          openTerminal("terminal");
        }
        return;
      }
      if (e.key === "Escape" && cmdOpen) {
        e.preventDefault();
        setCmdOpen(false);
        return;
      }
      if (e.key === "Escape" && quickOpen) {
        e.preventDefault();
        setQuickOpen(false);
        return;
      }
      // Ctrl+W — fermer onglet actif
      if (meta && e.key.toLowerCase() === "w" && !typing) {
        e.preventDefault();
        closeTab(activeId);
        return;
      }
      // Ctrl+J — panneau bas
      if (meta && e.key.toLowerCase() === "j" && !typing) {
        e.preventDefault();
        setTerminalOpen((v) => {
          const next = !v;
          if (next) setTermTab("terminal");
          return next;
        });
        return;
      }
      if (meta && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setAiOpen(true);
        window.setTimeout(() => aiInputRef.current?.focus(), 50);
      }
      if (meta && e.key === "Enter" && aiOpen && !pending && !aiBusy) {
        e.preventDefault();
        void askStudioAi();
      }
      if (e.key === "Escape" && pending) {
        e.preventDefault();
        rejectPending();
        return;
      }
      if (meta && e.key === "Enter" && pendingList.length > 0) {
        e.preventDefault();
        acceptAllPending();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOpen, pending, aiBusy, aiPrompt, active.id, active.value, activeId, engine, quickOpen, cmdOpen, onSaveCloud, helpOpen]);

  useEffect(() => {
    if (aiOpen) {
      const t = window.setTimeout(() => aiInputRef.current?.focus(), 120);
      return () => window.clearTimeout(t);
    }
  }, [aiOpen, activeId]);

  const pendingFile = pending
    ? files.find((f) => f.id === pending.fileId)
    : null;
  const pendingDelta = pending
    ? countLines(pending.after) - countLines(pending.before)
    : 0;
  const pendingStats = pending
    ? diffStats(pending.before, pending.after)
    : { added: 0, removed: 0 };

  const termColor: Record<TermLine["kind"], string> = {
    info: "text-[#9bb0a4]",
    ok: "text-[#3d8f68]",
    err: "text-red-400",
    cmd: "text-[#e8892a]",
  };

  return (
    <div className="okapi-studio-shell relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Activity bar */}
        <div className="okapi-studio-activity flex w-full shrink-0 flex-row items-center gap-0.5 border-b border-white/10 px-1 py-0.5 lg:w-10 lg:flex-col lg:gap-0.5 lg:border-b-0 lg:border-r lg:px-0 lg:py-1">
          <button
            type="button"
            title="Fichiers (Ctrl+B)"
            onClick={() => setExplorerOpen((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded transition ${
              explorerOpen
                ? "border-b-2 border-[#e8f2ec] bg-[#1b4f3a]/50 text-[#e8f2ec] lg:border-b-0 lg:border-l-2"
                : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
            }`}
          >
            <IconExplorer className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="IA"
            onClick={() => setAiOpen((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded transition ${
              aiOpen
                ? "border-b-2 border-[#ffd7a8] bg-[#e8892a]/25 text-[#ffd7a8] lg:border-b-0 lg:border-l-2"
                : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
            }`}
          >
            <IconSpark className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Preview"
            onClick={() => setPreviewOpen((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded transition ${
              previewOpen
                ? "border-b-2 border-[#e8f2ec] bg-[#1b4f3a]/50 text-[#e8f2ec] lg:border-b-0 lg:border-l-2"
                : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
            }`}
          >
            <IconPreview className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Terminal (Ctrl+`)"
            onClick={() =>
              setTerminalOpen((v) => {
                const next = !v;
                if (next) setTermTab("terminal");
                return next;
              })
            }
            className={`flex h-8 w-8 items-center justify-center rounded transition ${
              terminalOpen
                ? "border-b-2 border-[#e8f2ec] bg-[#1b4f3a]/50 text-[#e8f2ec] lg:border-b-0 lg:border-l-2"
                : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
            }`}
          >
            <IconTerminal className="h-4 w-4" />
          </button>
          <div className="ml-auto px-1 text-center text-[8px] font-bold uppercase tracking-wider text-[#5f766a] lg:ml-0 lg:mt-auto lg:pb-1">
            OK
          </div>
        </div>

        {/* Explorer */}
        {explorerOpen ? (
          <aside className="okapi-studio-panel flex w-[min(72vw,200px)] shrink-0 flex-col border-r border-white/10 lg:w-[200px]">
            <div className="border-b border-white/10 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7d9588]">
                  Explorateur
                </p>
                <button
                  type="button"
                  onClick={() => setQuickOpen(true)}
                  className="rounded border border-white/10 px-1 py-0.5 font-mono text-[9px] text-[#5f766a] hover:text-[#d5e4db]"
                  title="Quick Open"
                >
                  Ctrl+P
                </button>
              </div>
              <p className="mt-0.5 truncate text-[12px] font-semibold text-[#eef6f1]">
                {title || "Projet Okapi"}
              </p>
            </div>
            <nav className="scrollbar-thin flex-1 overflow-auto px-1 py-1.5">
              {groups.length === 0 ? (
                <div className="mx-1 rounded border border-dashed border-white/10 px-2 py-3 text-center">
                  <p className="text-[11px] font-semibold text-[#c8ddd2]">
                    Projet vide
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#6a7f74]">
                    Demande un fichier à l’Agent.
                  </p>
                </div>
              ) : (
                groups.map((group) => (
                <div key={group.id} className="mb-2">
                  <p className="px-2 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#5f766a]">
                    {group.label}
                  </p>
                  {group.items.map((file) => {
                    const selected = file.id === activeId;
                    const has = Boolean(file.value.trim());
                    const hasPending = pending?.fileId === file.id;
                    return (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => openFile(file.id)}
                        className={`mb-px flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left transition ${
                          selected
                            ? "bg-[#1b4f3a] text-white shadow-[inset_2px_0_0_#e8892a]"
                            : "text-[#b7c9bf] hover:bg-white/[0.04]"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            hasPending
                              ? "animate-pulse bg-[#e8892a]"
                              : has
                                ? "bg-[#3d8f68]"
                                : "bg-white/20"
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                          {file.label}
                        </span>
                        <span
                          className={`shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide ${
                            selected
                              ? "bg-white/15 text-white/90"
                              : "bg-white/5 text-[#7d9588]"
                          }`}
                        >
                          {file.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
              )}
            </nav>
          </aside>
        ) : null}

        {/* Center column: editor + terminal */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
            {/* Editor */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Tabs bar — multi-fichiers Okapi */}
              <div className="okapi-studio-chrome flex items-stretch border-b">
                <div className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto">
                  {tabFiles.map((file) => {
                    const selected = file.id === activeId;
                    const dirtyPending = pending?.fileId === file.id;
                    const dirty = dirtyIds.has(file.id) || dirtyPending;
                    return (
                      <div
                        key={file.id}
                        className={`group flex h-8 shrink-0 items-center gap-1 border-r border-white/10 px-2 ${
                          selected
                            ? "bg-[#15221c] text-[#eef6f1]"
                            : "bg-transparent text-[#7d9588] hover:bg-white/[0.03] hover:text-[#b7c9bf]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => openFile(file.id)}
                          className="flex max-w-[140px] items-center gap-1.5"
                          title={file.label}
                        >
                          {dirty ? (
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                dirtyPending
                                  ? "animate-pulse bg-[#e8892a]"
                                  : "bg-[#7dd3a0]"
                              }`}
                            />
                          ) : null}
                          <span className="truncate font-mono text-[11px] font-medium">
                            {file.label}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Fermer (Ctrl+W)"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(file.id);
                          }}
                          className={`rounded p-0.5 text-[10px] transition ${
                            selected
                              ? "opacity-70 hover:bg-white/10 hover:opacity-100"
                              : "opacity-0 group-hover:opacity-100 hover:bg-white/5"
                          }`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setQuickOpen(true)}
                    className="flex h-8 shrink-0 items-center px-2 text-[11px] text-[#5f766a] hover:text-[#d5e4db]"
                    title="Quick Open (Ctrl+P)"
                  >
                    +
                  </button>
                </div>
                {hasPendingHere ? (
                  <div className="flex items-center gap-1.5 border-l border-white/10 px-2">
                    {!splitDiff ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setDiffView("before")}
                          className={`rounded px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                            diffView === "before"
                              ? "bg-white/12 text-white"
                              : "text-[#7d9588] hover:text-white"
                          }`}
                        >
                          Original
                        </button>
                        <button
                          type="button"
                          onClick={() => setDiffView("after")}
                          className={`rounded px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                            diffView === "after"
                              ? "bg-[#e8892a]/25 text-[#ffd7a8]"
                              : "text-[#7d9588] hover:text-white"
                          }`}
                        >
                          Proposé
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={acceptPending}
                      className="rounded bg-[#2f6b4f] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#3a7d5c]"
                    >
                      Accepter
                    </button>
                    {pendingList.length > 1 ? (
                      <button
                        type="button"
                        onClick={acceptAllPending}
                        className="rounded bg-[#e8892a] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#d67a1f]"
                      >
                        Tout ({pendingList.length})
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={rejectPending}
                      className="rounded border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-[#c8ddd2] hover:bg-white/5"
                    >
                      Refuser
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setQuickOpen(true)}
                    className="hidden shrink-0 items-center gap-1.5 px-3 text-[10px] font-medium text-[#5f766a] hover:text-[#b7c9bf] sm:flex"
                    title="Quick Open"
                  >
                    <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono">
                      Ctrl+P
                    </span>
                  </button>
                )}
              </div>

              {hasPendingHere && pending ? (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e8892a]/30 bg-[#121c18] px-3 py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="rounded bg-[#e8892a]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#ffd7a8]">
                      Review
                    </span>
                    <span className="truncate font-mono text-[12px] text-[#eef6f1]">
                      {active.label}
                    </span>
                    <span className="font-mono text-[11px] text-[#9fd4b5]">
                      +{pendingStats.added}
                    </span>
                    <span className="font-mono text-[11px] text-red-300/90">
                      −{pendingStats.removed}
                    </span>
                    {pendingDelta !== 0 ? (
                      <span className="text-[10px] text-[#7d9588]">
                        ({pendingDelta > 0 ? "+" : ""}
                        {pendingDelta} lignes)
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSplitDiff((v) => !v)}
                    className="shrink-0 rounded border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-[#c8ddd2] hover:border-[#e8892a]/40 hover:text-[#ffd7a8]"
                  >
                    {splitDiff ? "Vue unique" : "Côte à côte"}
                  </button>
                </div>
              ) : null}

              <div className="relative min-h-0 flex-1">
                {!editorValue.trim() && !hasPendingHere ? (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
                    <div className="max-w-sm text-center">
                      <p className="text-[13px] font-medium text-[#5f766a]/80">
                        {visibleFiles.length === 0
                          ? "En attente d’un projet"
                          : "Fichier vide"}
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-[#5f766a]/55">
                        {visibleFiles.length === 0
                          ? "Ctrl+L · demande à l’Agent"
                          : active.emptyHint}
                      </p>
                    </div>
                  </div>
                ) : null}
                {hasPendingHere && splitDiff && pending ? (
                  <div className="flex h-full min-h-0 flex-col lg:flex-row">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-white/10 lg:border-b-0 lg:border-r lg:border-r-red-500/20">
                      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-red-500/25 bg-[#1a1212] px-3">
                        <div className="flex items-center gap-2">
                          <span className="h-full w-0.5 self-stretch bg-red-400/80" />
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-200">
                            Original
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-red-200/60">
                          {countLines(pending.before)} ln · −{pendingStats.removed}
                        </span>
                      </div>
                      <div className="min-h-0 flex-1 border-l-2 border-red-500/35">
                        <MonacoEditor
                          height="100%"
                          language={active.language}
                          theme="vs-dark"
                          value={pending.before}
                          options={monacoReviewOptions(true)}
                        />
                      </div>
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-[#3d8f68]/35 bg-[#0f1a15] px-3">
                        <div className="flex items-center gap-2">
                          <span className="h-full w-0.5 self-stretch bg-[#3d8f68]" />
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9fd4b5]">
                            Proposé
                          </span>
                          <span className="rounded bg-[#e8892a]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#ffd7a8]">
                            Modèle
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-[#9fd4b5]/75">
                          {countLines(pending.after)} ln · +{pendingStats.added}
                        </span>
                      </div>
                      <div className="min-h-0 flex-1 border-l-2 border-[#3d8f68]/50">
                        <MonacoEditor
                          height="100%"
                          language={active.language}
                          theme="vs-dark"
                          value={pending.after}
                          options={monacoReviewOptions(true)}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <MonacoEditor
                    height="100%"
                    path={studioFilePath(active.id)}
                    language={active.language}
                    theme="vs-dark"
                    value={editorValue}
                    beforeMount={handleMonacoBeforeMount}
                    onMount={handleMonacoMount}
                    onChange={(v) => {
                      if (pending?.fileId === active.id) return;
                      onChangeFile(active.id, v ?? "");
                      markDirty(active.id);
                    }}
                    options={{
                      ...monacoReviewOptions(hasPendingHere),
                      fontSize: 13.5,
                      renderLineHighlight: "line",
                      smoothScrolling: true,
                      cursorBlinking: "smooth",
                      roundedSelection: true,
                    }}
                  />
                )}
              </div>
            </div>

            {/* Preview — dans la colonne éditeur (Agent reste à droite) */}
            {previewOpen ? (
              <div className="okapi-studio-panel flex max-h-[38vh] w-full shrink-0 flex-col border-t border-white/10 lg:max-h-none lg:w-[min(48%,440px)] lg:border-l lg:border-t-0">
                <div className="okapi-studio-chrome flex h-8 shrink-0 items-center gap-1.5 border-b px-2">
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] text-[#7d9588]">
                    Preview
                  </span>
                  <span
                    className="shrink-0 rounded border border-white/10 bg-[#06100c]/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#9bb0a4]"
                    title="Seul app.html tourne ici — Next/Flutter/Python = ZIP"
                  >
                    HTML
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded border border-[#e8892a]/15 bg-[#06100c]/60 px-2 py-0.5">
                    <span
                      className={`shrink-0 text-[9px] ${
                        cloudStatus.tone === "ok"
                          ? "text-[#3d8f68]"
                          : "text-[#e8892a]"
                      }`}
                    >
                      ●
                    </span>
                    <span className="min-w-0 truncate font-mono text-[10px] text-[#9bb0a4]">
                      {previewUrl}
                    </span>
                  </div>
                  <span
                    title={cloudStatus.hint}
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                      cloudStatus.tone === "ok"
                        ? "bg-[#3d8f68]/20 text-[#9fd4b5]"
                        : "bg-[#e8892a]/15 text-[#ffd7a8]"
                    }`}
                  >
                    {cloudStatus.label}
                  </span>
                  <button
                    type="button"
                    title="Actualiser"
                    onClick={refreshPreview}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#7d9588] transition hover:bg-white/5 hover:text-[#d5e4db]"
                  >
                    <IconRefresh className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Fermer"
                    onClick={() => setPreviewOpen(false)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#7d9588] transition hover:bg-white/5 hover:text-[#d5e4db]"
                  >
                    <IconClose className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 bg-white">
                  {html?.trim() ? (
                    <iframe
                      ref={previewIframeRef}
                      key={previewKey}
                      title={`${title} preview`}
                      srcDoc={liveHtml || ""}
                      sandbox={OKAPI_PREVIEW_SANDBOX}
                      referrerPolicy="no-referrer"
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
                      <p className="text-sm font-medium text-gray-500">
                        Pas encore de preview
                      </p>
                      <p className="text-xs text-gray-400">
                        Génère un HTML ou édite app.html
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Terminal panel */}
          {terminalOpen ? (
            <div
              className="okapi-studio-panel flex shrink-0 flex-col border-t border-white/10"
              style={{ height: termHeight }}
            >
              <div className="flex h-1.5 cursor-ns-resize items-center justify-center bg-[#101c17] hover:bg-[#e8892a]/40"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const startY = e.clientY;
                  const startH = termHeight;
                  function onMove(ev: MouseEvent) {
                    const next = Math.min(420, Math.max(120, startH + (startY - ev.clientY)));
                    setTermHeight(next);
                  }
                  function onUp() {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  }
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
                title="Redimensionner"
              />
              <div className="okapi-studio-chrome flex items-center gap-0 border-b">
                {(
                  [
                    ["problems", "Problems"],
                    ["output", "Output"],
                    ["terminal", "Terminal"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTermTab(id)}
                    className={`border-b-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide transition ${
                      termTab === id
                        ? "border-[#e8892a] text-[#eef6f1]"
                        : "border-transparent text-[#5f766a] hover:text-[#9bb0a4]"
                    }`}
                  >
                    {label}
                    {id === "problems" && problemsBadge > 0 ? (
                      <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e8892a]/30 px-1 text-[9px] font-bold text-[#ffd7a8]">
                        {problemsBadge}
                      </span>
                    ) : null}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-1 pr-2">
                  <span className="hidden font-mono text-[9px] text-[#5f766a] sm:inline">
                    Ctrl+`
                  </span>
                  <button
                    type="button"
                    title="Réduire le terminal (Ctrl+`)"
                    onClick={() => setTerminalOpen(false)}
                    className="rounded p-1 text-[#5f766a] hover:bg-white/5 hover:text-[#d5e4db]"
                  >
                    <IconClose className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
                {termTab === "terminal" ? (
                  <>
                    {termLines.map((line, i) => (
                      <div key={`${line.t}-${i}`} className={termColor[line.kind]}>
                        {line.t}
                      </div>
                    ))}
                    <div ref={termEndRef} />
                  </>
                ) : termTab === "problems" ? (
                  studioProblems.length === 0 ? (
                    <p className="text-[#5f766a]">
                      Aucun problème · TS/JSON via Monaco + checks Okapi.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {problemsBadge > 0 ? (
                        <div className="flex items-center justify-between gap-2 pb-1">
                          <p className="text-[10px] text-[#5f766a]">
                            {problemsBadge} à corriger
                          </p>
                          <button
                            type="button"
                            disabled={aiBusy}
                            onClick={() => fixAllProblems()}
                            className="rounded border border-[#e8892a]/40 bg-[#e8892a]/15 px-2 py-0.5 text-[10px] font-bold text-[#ffd7a8] transition hover:bg-[#e8892a]/25 disabled:opacity-45"
                          >
                            Corriger tout
                          </button>
                        </div>
                      ) : null}
                      {studioProblems.map((p) => (
                        <div
                          key={p.id}
                          className={`flex items-start gap-2 rounded px-1.5 py-1 ${
                            p.severity === "error"
                              ? "text-[#ffb4a8]"
                              : p.severity === "warning"
                                ? "text-[#ffd7a8]"
                                : "text-[#9bb0a4]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => openProblem(p)}
                            className="flex min-w-0 flex-1 items-start gap-2 text-left transition hover:opacity-90"
                          >
                            <span
                              className={`mt-0.5 shrink-0 ${
                                p.severity === "error"
                                  ? "text-[#e85d4a]"
                                  : p.severity === "warning"
                                    ? "text-[#e8892a]"
                                    : "text-[#5f766a]"
                              }`}
                            >
                              ●
                            </span>
                            <span className="min-w-0">
                              <span className="font-semibold text-[#c8ddd2]">
                                {p.fileId}
                                {p.line ? `:${p.line}` : ""}
                              </span>
                              <span className="text-[#5f766a]"> · </span>
                              <span>{p.message}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={aiBusy}
                            title={
                              p.id.startsWith("pending-")
                                ? "Ouvrir la revue"
                                : "Demander à l’Agent de corriger"
                            }
                            onClick={() => fixProblem(p)}
                            className="shrink-0 rounded border border-white/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#eef6f1] transition hover:border-[#e8892a]/50 hover:bg-[#e8892a]/15 hover:text-[#ffd7a8] disabled:opacity-45"
                          >
                            {p.id.startsWith("pending-") ? "Voir" : "Fix"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="space-y-1 text-[#5f766a]">
                    <p>Output Okapi Studio</p>
                    <p>Agent · éditions · preview — activité aussi dans Terminal.</p>
                  </div>
                )}
              </div>

              {termTab === "terminal" ? (
                <form
                  className="okapi-studio-code flex shrink-0 items-center gap-2 border-t border-white/10 px-3 py-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    runTermCommand(termCmd);
                  }}
                >
                  <span className="font-mono text-[11px] font-semibold text-[#e8892a]">
                    PS&gt;
                  </span>
                  <input
                    ref={termInputRef}
                    value={termCmd}
                    onChange={(e) => setTermCmd(e.target.value)}
                    placeholder="npm run dev · dir · preview · help"
                    className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-[#eef6f1] outline-none placeholder:text-[#4a5c54]"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </form>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Agent Okapi — rail droit dense */}
        {aiOpen ? (
          <aside className="okapi-studio-panel flex max-h-[46vh] w-full shrink-0 flex-col border-t border-white/10 lg:max-h-none lg:w-[min(32%,320px)] lg:border-l lg:border-t-0">
            <div className="flex h-7 items-center justify-between gap-2 border-b border-white/10 px-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#eef6f1]">
                  Agent
                </p>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value as OkapiAgentId)}
                  disabled={aiBusy}
                  className="max-w-[130px] truncate rounded border border-white/10 bg-[#06100c] px-1 py-0.5 text-[9px] text-[#ffd7a8] outline-none focus:border-[#e8892a]"
                  title="Agent métier"
                >
                  {OKAPI_AGENTS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="rounded border border-white/10 px-1 py-px font-mono text-[8px] uppercase text-[#8aa89a]">
                  {engine}
                </span>
                <button
                  type="button"
                  title="Réduire l’agent"
                  onClick={() => setAiOpen(false)}
                  className="rounded p-0.5 text-[#5f766a] hover:bg-white/5 hover:text-[#d5e4db]"
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2 py-2">
              {aiMessages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className="text-[12px] leading-snug"
                >
                  <span
                    className={`mr-1.5 font-mono text-[9px] font-bold ${
                      m.role === "user" ? "text-[#6a8578]" : "text-[#e8892a]"
                    }`}
                  >
                    {m.role === "user" ? "›" : "◆"}
                  </span>
                  <span
                    className={
                      m.role === "user" ? "text-[#eef6f1]" : "text-[#b7c9bf]"
                    }
                  >
                    {m.content}
                  </span>
                </div>
              ))}

              {pending && pendingFile ? (
                <div className="overflow-hidden rounded border border-[#e8892a]/35 bg-[#121a16]">
                  <div className="flex items-center justify-between gap-2 border-b border-[#e8892a]/25 bg-[#e8892a]/10 px-2 py-1">
                    <div className="min-w-0">
                      <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#ffd7a8]">
                        Review
                        {pendingList.length > 1
                          ? ` · ${pendingList.length}`
                          : ""}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-[#eef6f1]">
                        {pendingFile.label}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 font-mono text-[10px]">
                      <span className="text-[#9fd4b5]">+{pendingStats.added}</span>
                      <span className="text-red-300">−{pendingStats.removed}</span>
                    </div>
                  </div>
                  <div className="p-2">
                    {pending.fileId !== active.id ? (
                      <button
                        type="button"
                        onClick={() => openFile(pending.fileId)}
                        className="mb-1.5 rounded border border-white/12 px-2 py-0.5 text-[10px] font-semibold text-[#d5e4db] hover:bg-white/5"
                      >
                        Ouvrir
                      </button>
                    ) : null}
                    {pendingList.length > 1 ? (
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {pendingList.map((p) => (
                          <button
                            key={p.fileId}
                            type="button"
                            onClick={() => openFile(p.fileId)}
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                              p.fileId === pending.fileId
                                ? "bg-[#e8892a]/25 text-[#ffd7a8]"
                                : "bg-white/5 text-[#9bb0a4] hover:bg-white/10"
                            }`}
                          >
                            {p.fileId}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-[11px] leading-snug text-[#c9b896]">
                      {pending.note}
                    </p>
                    {pendingDiffLines.length > 0 ? (
                      <pre className="mt-1.5 max-h-36 overflow-auto rounded border border-white/10 bg-[#0a100e] p-1.5 font-mono text-[10px] leading-relaxed">
                        {pendingDiffLines.map((line, idx) => (
                          <div
                            key={`${line.type}-${idx}`}
                            className={
                              line.type === "add"
                                ? "bg-[#1b4f3a]/40 text-[#9fd4b5]"
                                : line.type === "del"
                                  ? "bg-red-500/15 text-red-300"
                                  : "text-[#5f766a]"
                            }
                          >
                            <span className="inline-block w-3 select-none opacity-70">
                              {line.type === "add"
                                ? "+"
                                : line.type === "del"
                                  ? "-"
                                  : " "}
                            </span>
                            {line.text || " "}
                          </div>
                        ))}
                      </pre>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (pending.fileId !== active.id) openFile(pending.fileId);
                          setSplitDiff(true);
                        }}
                        className="rounded border border-white/12 px-2 py-1 text-[10px] font-semibold text-[#c8ddd2] hover:bg-white/5"
                      >
                        Voir
                      </button>
                      <button
                        type="button"
                        onClick={acceptPending}
                        className="rounded bg-[#2f6b4f] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[#3a7d5c]"
                      >
                        Accepter
                      </button>
                      {pendingList.length > 1 ? (
                        <button
                          type="button"
                          onClick={acceptAllPending}
                          className="rounded bg-[#e8892a] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[#d67a1f]"
                        >
                          Tout ({pendingList.length})
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={rejectPending}
                        className="rounded border border-white/12 px-2.5 py-1 text-[10px] font-semibold text-[#d5e4db] hover:bg-white/5"
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {aiBusy || aiProgress ? (
                <div className="border-l-2 border-[#e8892a]/50 py-1 pl-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-[#ffd7a8]">
                      <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#e8892a]" />
                      <span className="truncate">
                        {aiProgress?.message || "Okapi répond…"}
                      </span>
                    </p>
                    {aiProgress ? (
                      <span className="shrink-0 font-mono text-[10px] text-[#8aa89a]">
                        {aiProgress.step}/{aiProgress.total}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#0c1411]">
                    <div
                      className="h-full rounded-full bg-[#e8892a] transition-[width] duration-500 ease-out"
                      style={{
                        width: `${
                          aiProgress
                            ? Math.min(
                                100,
                                Math.round(
                                  (aiProgress.step / Math.max(1, aiProgress.total)) *
                                    100,
                                ),
                              )
                            : 35
                        }%`,
                      }}
                    />
                  </div>
                  {aiLiveCode ? (
                    <div className="mt-2 overflow-hidden rounded border border-white/10 bg-[#070c0a]">
                      <div className="flex items-center justify-between border-b border-white/8 px-2 py-1">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wide text-[#e8892a]">
                          {aiLiveLabel}
                        </span>
                        <span className="font-mono text-[9px] text-[#5f766a]">
                          live
                        </span>
                      </div>
                      <pre
                        ref={liveCodeEndRef}
                        className="max-h-52 overflow-auto p-2 font-mono text-[10px] leading-relaxed text-[#9fd4b5] whitespace-pre-wrap break-all"
                      >
                        {aiLiveCode}
                        <span className="inline-block h-3 w-1.5 animate-pulse bg-[#e8892a]/80 align-middle" />
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {aiError ? (
                <p className="border-l-2 border-red-400/50 py-1 pl-2 text-[11px] text-red-300">
                  {aiError}
                </p>
              ) : null}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={(e) => void askStudioAi(e)}
              className="border-t border-white/10 p-2"
            >
              <textarea
                ref={aiInputRef}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void askStudioAi();
                  }
                }}
                rows={2}
                disabled={aiBusy}
                placeholder={
                  pendingList.length
                    ? "Accepte / Refuse, ou nouvelle demande…"
                    : "Crée une boutique CRM… (projet complet + serveur)"
                }
                className="w-full resize-none rounded border border-white/10 bg-[#06100c]/70 px-2 py-1.5 text-[12px] text-[#eef6f1] outline-none placeholder:text-[#5f766a] focus:border-[#2f6b4f] disabled:opacity-50"
              />
              <div className="mt-1.5 flex items-center gap-1.5">
                <button
                  type="submit"
                  disabled={aiBusy || !aiPrompt.trim()}
                  className="flex-1 rounded bg-[#e8892a] px-2 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#d67a1f] disabled:opacity-45"
                >
                  {aiBusy ? "…" : "Envoyer"}
                </button>
                <span className="hidden font-mono text-[9px] text-[#5f766a] sm:inline">
                  ↵
                </span>
              </div>
              <p className="mt-1 text-[9px] leading-snug text-[#5f766a]">
                Okapi peut se tromper — vérifie le code avant prod.
              </p>
            </form>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAiOpen(true);
              window.setTimeout(() => aiInputRef.current?.focus(), 80);
            }}
            className="absolute bottom-8 right-3 z-30 flex items-center gap-1.5 rounded-md border border-[#e8892a]/35 bg-[#0d1512] px-2.5 py-1.5 text-[11px] font-semibold text-[#ffd7a8] shadow-md shadow-black/30 transition hover:border-[#e8892a] hover:bg-[#15211c]"
            title="Ouvrir l’agent (Ctrl+L)"
          >
            <IconSpark className="h-3.5 w-3.5" />
            Agent
            <span className="font-mono text-[9px] text-[#9bb0a4]">Ctrl+L</span>
          </button>
        )}
      </div>

      {/* Status bar — pleine largeur workbench */}
      <div className="flex h-5 shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#0a1410] px-2 text-[10px] text-[#8aa89a]">
        <div className="flex min-w-0 items-center gap-2.5 overflow-x-auto">
          <span className="shrink-0 font-semibold text-[#c8ddd2]">Okapi</span>
          <button
            type="button"
            onClick={() => openTerminal("problems")}
            className={`shrink-0 rounded px-0.5 font-semibold hover:bg-white/10 hover:text-[#eef6f1] ${
              problemsBadge > 0 ? "text-[#ffd7a8]" : ""
            }`}
            title="Problems"
          >
            {problemsBadge > 0 ? `${problemsBadge} problem${problemsBadge > 1 ? "s" : ""}` : "Problems"}
          </button>
          <span className="shrink-0">Ln {lineCount}</span>
          <span className="shrink-0 uppercase">{active.language}</span>
          <button
            type="button"
            onClick={() => openTerminal("terminal")}
            className="shrink-0 rounded px-0.5 font-semibold hover:bg-white/10 hover:text-[#eef6f1]"
            title="Terminal (Ctrl+`)"
          >
            Terminal
          </button>
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="shrink-0 rounded px-0.5 font-semibold hover:bg-white/10 hover:text-[#eef6f1]"
            title="Palette (Ctrl+Shift+P)"
          >
            Cmd
          </button>
          {dirtyIds.size > 0 ? (
            <span className="shrink-0 text-[#ffd7a8]">
              {dirtyIds.size} modifié{dirtyIds.size > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {aiBusy ? (
            <span className="flex items-center gap-1.5 text-[#ffd7a8]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#e8892a]" />
              Modèle…
            </span>
          ) : serverRunning ? (
            <span className="flex items-center gap-1.5 text-[#9fd4b5]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#3d8f68]" />
              Serveur
            </span>
          ) : pending ? (
            <span className="font-mono text-[#ffd7a8]">
              Review +{pendingStats.added}/−{pendingStats.removed}
            </span>
          ) : null}
          <span
            title={cloudStatus.hint}
            className={
              cloudStatus.tone === "ok" ? "text-[#9fd4b5]" : "text-[#ffd7a8]"
            }
          >
            {cloudStatus.label}
          </span>
          {stackHints.length > 1 ? (
            <span
              className="max-w-[220px] truncate text-[#5f766a]"
              title={stackHints.join(" · ")}
            >
              {stackHints.slice(1).join(" · ")}
            </span>
          ) : null}
          <span>UTF-8</span>
          <span className="text-[#5f766a]">MMC</span>
        </div>
      </div>

      {/* Quick Open — Ctrl+P */}
      {quickOpen ? (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fermer Quick Open"
            onClick={() => setQuickOpen(false)}
          />
          <div className="okapi-studio-chrome relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl shadow-black/50">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#e8892a]">
                Quick Open
              </span>
              <input
                ref={quickInputRef}
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setQuickIndex((i) =>
                      Math.min(i + 1, Math.max(0, quickMatches.length - 1)),
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setQuickIndex((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const hit = quickMatches[quickIndex] ?? quickMatches[0];
                    if (hit) openFile(hit.id);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setQuickOpen(false);
                  }
                }}
                placeholder="Chercher un fichier…"
                className="min-w-0 flex-1 bg-transparent text-sm text-[#eef6f1] outline-none placeholder:text-[#5f766a]"
              />
              <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-[#5f766a]">
                Esc
              </span>
            </div>
            <div className="max-h-[50vh] overflow-y-auto py-1">
              {quickMatches.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[#5f766a]">
                  Aucun fichier
                </p>
              ) : (
                quickMatches.map((file, i) => {
                  const activeRow = i === quickIndex;
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onMouseEnter={() => setQuickIndex(i)}
                      onClick={() => openFile(file.id)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                        activeRow
                          ? "bg-[#1b4f3a]/55 text-white"
                          : "text-[#b7c9bf] hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="w-14 shrink-0 text-[10px] font-bold uppercase text-[#7d9588]">
                        {file.badge}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                        {file.label}
                      </span>
                      <span className="shrink-0 text-[10px] text-[#5f766a]">
                        {STUDIO_GROUP_LABEL[file.group]}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Command Palette — Ctrl+Shift+P */}
      {cmdOpen ? (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fermer la palette"
            onClick={() => setCmdOpen(false)}
          />
          <div className="okapi-studio-chrome relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl shadow-black/50">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#e8892a]">
                Commandes
              </span>
              <input
                ref={cmdInputRef}
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCmdIndex((i) =>
                      Math.min(i + 1, Math.max(0, cmdMatches.length - 1)),
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCmdIndex((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const hit = cmdMatches[cmdIndex] ?? cmdMatches[0];
                    if (hit) runStudioCommand(hit);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setCmdOpen(false);
                  }
                }}
                placeholder="Tape une commande…"
                className="min-w-0 flex-1 bg-transparent text-sm text-[#eef6f1] outline-none placeholder:text-[#5f766a]"
              />
              <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-[#5f766a]">
                Ctrl+Shift+P
              </span>
            </div>
            <div className="max-h-[50vh] overflow-y-auto py-1">
              {cmdMatches.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[#5f766a]">
                  Aucune commande
                </p>
              ) : (
                cmdMatches.map((cmd, i) => {
                  const activeRow = i === cmdIndex;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onMouseEnter={() => setCmdIndex(i)}
                      onClick={() => runStudioCommand(cmd)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                        activeRow
                          ? "bg-[#1b4f3a]/55 text-white"
                          : "text-[#b7c9bf] hover:bg-white/[0.04]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {cmd.label}
                      </span>
                      {cmd.hint ? (
                        <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-[#5f766a]">
                          {cmd.hint}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Aide raccourcis */}
      {helpOpen ? (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[10vh] backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fermer l’aide"
            onClick={() => setHelpOpen(false)}
          />
          <div className="okapi-studio-chrome relative z-10 w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#e8892a]">
                Raccourcis Okapi Studio
              </p>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="rounded p-1 text-[#7d9588] hover:bg-white/5 hover:text-white"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2 px-4 py-4 text-[12px] text-[#b7c9bf]">
              {(
                [
                  ["Ctrl+L", "Focus Agent"],
                  ["Ctrl+P", "Quick Open fichier"],
                  ["Ctrl+Shift+P", "Palette · npm run dev"],
                  ["Ctrl+W", "Fermer onglet"],
                  ["Ctrl+`", "Terminal PowerShell"],
                  ["Ctrl+J", "Panneau bas"],
                  ["Ctrl+B", "Explorateur"],
                  ["Ctrl+S", "Sauvegarder cloud"],
                  ["Ctrl+/", "Cette aide"],
                  ["Entrée", "Envoyer à l’agent"],
                  ["Échap", "Refuser diff / fermer"],
                ] as const
              ).map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span>{label}</span>
                  <kbd className="rounded border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-[#ffd7a8]">
                    {key}
                  </kbd>
                </li>
              ))}
            </ul>
            <p className="border-t border-white/10 px-4 py-3 text-[11px] text-[#5f766a]">
              Élève Okapi · Studio professionnel · MMC SARL
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
