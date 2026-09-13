"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="okapi-studio-shell flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--okapi-studio-muted)]">
      <span className="h-8 w-8 animate-pulse rounded-lg bg-[#1b4f3a]/40" />
      Chargement Okapi Studio…
    </div>
  ),
});

export type StudioFileId =
  | "app.html"
  | "App.tsx"
  | "App.native.tsx"
  | "app/page.tsx"
  | "schema.sql"
  | "api.ts"
  | "main.py"
  | "main.dart"
  | "README.md";

type StudioFile = {
  id: StudioFileId;
  label: string;
  language: string;
  badge: string;
  group: "web" | "mobile" | "data" | "docs";
  value: string;
  emptyHint: string;
};

type OkapiStudioProps = {
  title: string;
  html: string | null;
  react: string | null;
  reactNative: string | null;
  nextjs: string | null;
  sql: string | null;
  api: string | null;
  python: string | null;
  flutter: string | null;
  readme: string | null;
  showPreview: boolean;
  engine?: string;
  onChangeFile: (id: StudioFileId, value: string) => void;
  onCommitted?: (fileId: StudioFileId, content: string) => void;
  onSaveCloud?: () => void | Promise<boolean>;
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

const GROUP_LABEL: Record<StudioFile["group"], string> = {
  web: "Web",
  mobile: "Mobile",
  data: "Backend",
  docs: "Docs",
};

const SUGGESTIONS = [
  "Crée un projet complet : CRM clients + stock pour une boutique à Kinshasa",
  "Ajoute un header responsive",
  "Crée un formulaire login",
  "Améliore le design mobile",
];

function wantsStudioProject(text: string) {
  return /\b(projet complet|grand projet|fullstack|full[\s-]?stack|scaffold|génère(r)? (tout|le projet)|crée(r)? (un |une )?(projet|app|application|site|plateforme|crm|saas|dashboard)|build (a |an |the )?full)\b/i.test(
    text,
  );
}

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
  sql,
  api,
  python,
  flutter,
  readme,
  showPreview: _showPreview,
  engine = "flash",
  onChangeFile,
  onCommitted,
  onSaveCloud,
}: OkapiStudioProps) {
  const files = useMemo<StudioFile[]>(
    () => [
      {
        id: "app.html",
        label: "app.html",
        language: "html",
        badge: "HTML",
        group: "web",
        value: html ?? "",
        emptyHint: "Génère une app ou demande à l’IA.",
      },
      {
        id: "App.tsx",
        label: "App.tsx",
        language: "typescript",
        badge: "React",
        group: "web",
        value: react ?? "",
        emptyHint: "React web — « crée un composant login ».",
      },
      {
        id: "app/page.tsx",
        label: "app/page.tsx",
        language: "typescript",
        badge: "Next",
        group: "web",
        value: nextjs ?? "",
        emptyHint: "Next.js — page App Router.",
      },
      {
        id: "App.native.tsx",
        label: "App.native.tsx",
        language: "typescript",
        badge: "RN",
        group: "mobile",
        value: reactNative ?? "",
        emptyHint: "React Native — écran mobile.",
      },
      {
        id: "main.dart",
        label: "main.dart",
        language: "dart",
        badge: "Flutter",
        group: "mobile",
        value: flutter ?? "",
        emptyHint: "Flutter — widget principal.",
      },
      {
        id: "schema.sql",
        label: "schema.sql",
        language: "sql",
        badge: "SQL",
        group: "data",
        value: sql ?? "",
        emptyHint: "Tables, index, RLS.",
      },
      {
        id: "api.ts",
        label: "api.ts",
        language: "typescript",
        badge: "API",
        group: "data",
        value: api ?? "",
        emptyHint: "Routes backend TypeScript.",
      },
      {
        id: "main.py",
        label: "main.py",
        language: "python",
        badge: "Py",
        group: "data",
        value: python ?? "",
        emptyHint: "Backend Python / FastAPI.",
      },
      {
        id: "README.md",
        label: "README.md",
        language: "markdown",
        badge: "MD",
        group: "docs",
        value: readme ?? "",
        emptyHint: "Documentation du projet.",
      },
    ],
    [html, react, reactNative, nextjs, sql, api, python, flutter, readme],
  );

  const [activeId, setActiveId] = useState<StudioFileId>("app.html");
  const active = files.find((f) => f.id === activeId) ?? files[0];
  const [openTabs, setOpenTabs] = useState<StudioFileId[]>(["app.html"]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [quickIndex, setQuickIndex] = useState(0);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [cmdIndex, setCmdIndex] = useState(0);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<StudioFileId>>(() => new Set());
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [termCmd, setTermCmd] = useState("");
  const [termHeight, setTermHeight] = useState(220);
  const termInputRef = useRef<HTMLInputElement>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [termTab, setTermTab] = useState<TermTab>("terminal");
  const [termLines, setTermLines] = useState<TermLine[]>([
    {
      t: "Okapi Terminal — comme Cursor. Ctrl+` pour ouvrir/fermer · tape help",
      kind: "info",
    },
  ]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingList, setPendingList] = useState<PendingEdit[]>([]);
  const pending =
    pendingList.find((p) => p.fileId === activeId) ?? pendingList[0] ?? null;
  const [diffView, setDiffView] = useState<"after" | "before">("after");
  const [splitDiff, setSplitDiff] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const termEndRef = useRef<HTMLDivElement>(null);
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([
    {
      role: "assistant",
      content:
        "Salut — je suis l’agent Okapi Studio. Demande un projet complet (CRM, boutique, école…) : je génère plusieurs fichiers, tu Acceptes. Ou édite un fichier précis. Ctrl+L pour me focus.",
    },
  ]);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);

  const previewUrl = `okapi://preview/${previewSlug(title)}`;

  const logTerm = useCallback((text: string, kind: TermLine["kind"] = "info") => {
    const stamp = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setTermLines((prev) => [...prev, { t: `[${stamp}] ${text}`, kind }]);
  }, []);

  const groups = useMemo(() => {
    const order: StudioFile["group"][] = ["web", "mobile", "data", "docs"];
    return order
      .map((g) => ({
        id: g,
        label: GROUP_LABEL[g],
        items: files.filter((f) => f.group === g),
      }))
      .filter((g) => g.items.length > 0);
  }, [files]);

  const quickMatches = useMemo(() => {
    const q = quickQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        f.badge.toLowerCase().includes(q) ||
        GROUP_LABEL[f.group].toLowerCase().includes(q),
    );
  }, [files, quickQuery]);

  const tabFiles = useMemo(
    () =>
      openTabs
        .map((id) => files.find((f) => f.id === id))
        .filter((f): f is StudioFile => Boolean(f)),
    [openTabs, files],
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
        label: "Basculer Terminal",
        hint: "Ctrl+`",
        run: () =>
          setTerminalOpen((v) => {
            const next = !v;
            if (next) setTermTab("terminal");
            return next;
          }),
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
    return list;
    // acceptPending/rejectPending via closure at click time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, pendingList.length, onSaveCloud, logTerm]);

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
    const preferred =
      files.find((f) => f.value.trim())?.id ?? ("app.html" as StudioFileId);
    setActiveId((prev) => {
      const still = files.find((f) => f.id === prev);
      if (still?.value.trim()) return prev;
      return preferred;
    });
    setOpenTabs((prev) => {
      if (prev.includes(preferred)) return prev;
      return prev.length ? [...prev, preferred] : [preferred];
    });
  }, [files]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, aiBusy]);

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

  function runTermCommand(raw: string) {
    const line = raw.trim();
    if (!line) return;
    logTerm(`okapi › ${line}`, "cmd");
    setTermCmd("");
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(" ").trim().toLowerCase();
    const c = cmd.toLowerCase();

    if (c === "help" || c === "?") {
      logTerm(
        "Commandes : help · clear · status · preview · agent · open <fichier> · accept · reject · (Ctrl+P = quick open)",
        "info",
      );
      return;
    }
    if (c === "clear" || c === "cls") {
      setTermLines([
        {
          t: "Terminal vidé. Ctrl+` pour masquer · help pour les commandes.",
          kind: "info",
        },
      ]);
      return;
    }
    if (c === "status") {
      logTerm(
        `Projet « ${title || "Okapi"} » · fichier @${active.label} · ${lineCount} lignes · agent ${aiOpen ? "ouvert" : "fermé"} · pending ${pending ? "oui" : "non"}`,
        "ok",
      );
      return;
    }
    if (c === "preview") {
      setPreviewOpen(true);
      setPreviewKey((k) => k + 1);
      logTerm("Preview ouverte / actualisée", "ok");
      return;
    }
    if (c === "agent") {
      setAiOpen(true);
      logTerm("Agent Okapi focus (Ctrl+L)", "ok");
      window.setTimeout(() => aiInputRef.current?.focus(), 80);
      return;
    }
    if (c === "accept") {
      if (!pending) {
        logTerm("Aucun diff en attente", "info");
        return;
      }
      acceptPending();
      return;
    }
    if (c === "reject") {
      if (!pending) {
        logTerm("Aucun diff en attente", "info");
        return;
      }
      rejectPending();
      return;
    }
    if (c === "open") {
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
    logTerm(`Commande inconnue : ${cmd}. Tape help`, "err");
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
    setActiveId(id);
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuickOpen(false);
    const file = files.find((f) => f.id === id);
    logTerm(`Ouverture ${file?.label ?? id}`, "cmd");
  }

  function closeTab(id: StudioFileId) {
    setOpenTabs((prev) => {
      const next = prev.filter((x) => x !== id);
      const fallback = (next[0] ?? "app.html") as StudioFileId;
      if (next.length === 0) {
        setActiveId("app.html");
        return ["app.html"];
      }
      if (activeId === id) {
        const idx = prev.indexOf(id);
        setActiveId(next[Math.max(0, idx - 1)] ?? fallback);
      }
      return next;
    });
  }

  function refreshPreview() {
    setPreviewKey((k) => k + 1);
    logTerm("Preview actualisée", "info");
  }

  async function askStudioAi(e?: FormEvent) {
    e?.preventDefault();
    const instruction = aiPrompt.trim();
    if (!instruction || aiBusy || pendingList.length > 0) return;

    setAiBusy(true);
    setAiError(null);
    setAiPrompt("");
    setAiMessages((prev) => [...prev, { role: "user", content: instruction }]);

    const asProject = wantsStudioProject(instruction);

    try {
      if (asProject) {
        logTerm(`IA · projet complet demandé…`, "cmd");
        setAiMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Je construis le projet multi-fichiers (comme Cursor)…",
          },
        ]);

        const res = await fetch("/api/studio-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction,
            engine,
            title: title || undefined,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          title?: string;
          note?: string;
          files?: { fileId: StudioFileId; content: string }[];
          error?: string;
        } | null;

        if (!res.ok || !data?.files?.length) {
          throw new Error(data?.error || "Génération projet impossible.");
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

        setPendingList(batch);
        setOpenTabs((prev) => {
          const ids = batch.map((b) => b.fileId);
          const merged = [...prev];
          for (const id of ids) {
            if (!merged.includes(id)) merged.push(id);
          }
          return merged;
        });
        setActiveId(batch[0]!.fileId);
        setDiffView("after");
        setSplitDiff(true);
        setAiOpen(true);
        setAiMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `${data.note || "Projet prêt."} ${batch.length} fichiers à Accepter (tout ou un par un).`,
          },
        ]);
        logTerm(
          `Projet prêt · ${batch.length} fichiers — en attente d’Acceptation`,
          "ok",
        );
        return;
      }

      logTerm(`IA · édition demandée sur ${active.label}…`, "cmd");
      const res = await fetch("/api/studio-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          fileId: active.id,
          fileLabel: active.label,
          language: active.language,
          content: active.value,
          engine,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        content?: string;
        note?: string;
        error?: string;
      } | null;

      if (!res.ok || !data?.content) {
        throw new Error(data?.error || "Édition impossible.");
      }

      if (data.content === active.value) {
        setAiMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Aucun changement détecté." },
        ]);
        logTerm("IA · aucun changement détecté", "info");
        return;
      }

      setPendingList([
        {
          fileId: active.id,
          before: active.value,
          after: data.content,
          note: data.note || `Proposition pour ${active.label}`,
        },
      ]);
      setDiffView("after");
      setSplitDiff(true);
      setAiOpen(true);
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `${data.note || "Proposition prête."} Vérifie le diff, puis Accepte ou Refuse.`,
        },
      ]);
      logTerm(
        `Diff prêt · ${active.label} (${countLines(active.value)} → ${countLines(data.content)} lignes) — en attente d’Acceptation`,
        "ok",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur IA Studio";
      setAiError(msg);
      setAiMessages((prev) => [...prev, { role: "assistant", content: msg }]);
      logTerm(`Erreur IA · ${msg}`, "err");
      setTerminalOpen(true);
      setTermTab("terminal");
    } finally {
      setAiBusy(false);
    }
  }

  function acceptPending() {
    if (!pending) return;
    onChangeFile(pending.fileId, pending.after);
    const wasHtml = pending.fileId === "app.html";
    const { fileId, after } = pending;
    clearDirty(fileId);
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
          } Projet à jour — dis la suite.`,
        },
      ]);
      if (wasHtml) setPreviewOpen(true);
    } else {
      setActiveId(remaining[0]!.fileId);
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✓ ${fileId} accepté. Reste ${remaining.length} fichier(s) — Accepte tout ou continue un par un.`,
        },
      ]);
    }
    logTerm(`Accepté · ${fileId}`, "ok");
    window.setTimeout(() => aiInputRef.current?.focus(), 80);
  }

  function acceptAllPending() {
    if (pendingList.length === 0) return;
    let hadHtml = false;
    const batch = [...pendingList];
    for (const item of batch) {
      onChangeFile(item.fileId, item.after);
      onCommitted?.(item.fileId, item.after);
      clearDirty(item.fileId);
      if (item.fileId === "app.html") hadHtml = true;
    }
    const n = batch.length;
    setPendingList([]);
    setAiMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `✓ Projet appliqué · ${n} fichiers acceptés. Ouvre Preview si besoin.`,
      },
    ]);
    logTerm(`Accepté tout · ${n} fichiers`, "ok");
    if (hadHtml) setPreviewOpen(true);
    window.setTimeout(() => aiInputRef.current?.focus(), 80);
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

  function useSuggestion(text: string) {
    if (pendingList.length > 0 || aiBusy) return;
    setAiPrompt(text);
    window.setTimeout(() => aiInputRef.current?.focus(), 40);
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

      // Ctrl+` — toggle terminal (comme Cursor / VS Code)
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
      // Ctrl+B — explorateur (Cursor / VS Code)
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
      // Ctrl+J — panneau bas (Cursor)
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
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOpen, pending, aiBusy, aiPrompt, active.id, active.value, engine, quickOpen, cmdOpen, onSaveCloud, helpOpen]);

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

  const termColor: Record<TermLine["kind"], string> = {
    info: "text-[#9bb0a4]",
    ok: "text-[#3d8f68]",
    err: "text-red-400",
    cmd: "text-[#e8892a]",
  };

  return (
    <div className="okapi-studio-shell relative flex h-full min-h-[480px] flex-1 flex-col overflow-hidden">
      {/* Safety banner */}
      <div className="okapi-studio-chrome flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8892a] shadow-[0_0_8px_rgba(232,137,42,0.65)]" />
        <p className="text-[11px] leading-snug text-[#b7c9bf]">
          Agent à droite · Terminal bas comme Cursor (
          <span className="font-mono text-[#ffd7a8]">Ctrl+`</span>
          ) — diffs après{" "}
          <span className="font-semibold text-[#3d8f68]">Accepter</span>.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Activity bar */}
        <div className="okapi-studio-activity flex w-full shrink-0 flex-row items-center gap-1 border-b border-white/10 px-2 py-1 lg:w-12 lg:flex-col lg:border-b-0 lg:border-r lg:px-0 lg:py-2">
          <button
            type="button"
            title="Fichiers (Ctrl+B)"
            onClick={() => setExplorerOpen((v) => !v)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${
              explorerOpen
                ? "border-b-2 border-[#e8f2ec] bg-[#1b4f3a]/50 text-[#e8f2ec] lg:border-b-0 lg:border-l-2"
                : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
            }`}
          >
            <IconExplorer className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="IA"
            onClick={() => setAiOpen((v) => !v)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${
              aiOpen
                ? "border-b-2 border-[#ffd7a8] bg-[#e8892a]/25 text-[#ffd7a8] lg:border-b-0 lg:border-l-2"
                : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
            }`}
          >
            <IconSpark className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="Preview"
            onClick={() => setPreviewOpen((v) => !v)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${
              previewOpen
                ? "border-b-2 border-[#e8f2ec] bg-[#1b4f3a]/50 text-[#e8f2ec] lg:border-b-0 lg:border-l-2"
                : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
            }`}
          >
            <IconPreview className="h-5 w-5" />
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
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${
              terminalOpen
                ? "border-b-2 border-[#e8f2ec] bg-[#1b4f3a]/50 text-[#e8f2ec] lg:border-b-0 lg:border-l-2"
                : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
            }`}
          >
            <IconTerminal className="h-5 w-5" />
          </button>
          <div className="ml-auto px-1 text-center text-[9px] font-bold uppercase tracking-wider text-[#5f766a] lg:ml-0 lg:mt-auto lg:pb-1">
            OK
          </div>
        </div>

        {/* Explorer — hidden on small screens when preview open to save space */}
        {explorerOpen ? (
          <aside className="okapi-studio-panel flex w-[min(72vw,220px)] shrink-0 flex-col border-r border-white/10 lg:w-[220px]">
            <div className="border-b border-white/10 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7d9588]">
                  Explorateur
                </p>
                <button
                  type="button"
                  onClick={() => setQuickOpen(true)}
                  className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-[#5f766a] hover:text-[#d5e4db]"
                  title="Quick Open"
                >
                  Ctrl+P
                </button>
              </div>
              <p className="mt-1 truncate text-[13px] font-semibold text-[#eef6f1]">
                {title || "Projet Okapi"}
              </p>
            </div>
            <nav className="scrollbar-thin flex-1 overflow-auto px-1.5 py-2">
              {groups.map((group) => (
                <div key={group.id} className="mb-3">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5f766a]">
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
                        className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
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
                        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
                          {file.label}
                        </span>
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
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
              ))}
            </nav>
          </aside>
        ) : null}

        {/* Center column: editor + terminal */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
            {/* Editor */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* Tabs bar — multi-fichiers comme Cursor */}
              <div className="okapi-studio-chrome flex items-stretch border-b">
                <div className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto">
                  {tabFiles.map((file) => {
                    const selected = file.id === activeId;
                    const dirtyPending = pending?.fileId === file.id;
                    const dirty = dirtyIds.has(file.id) || dirtyPending;
                    return (
                      <div
                        key={file.id}
                        className={`group flex h-9 shrink-0 items-center gap-1.5 border-r border-white/10 px-2.5 ${
                          selected
                            ? "bg-[#15221c] text-[#eef6f1]"
                            : "bg-transparent text-[#7d9588] hover:bg-white/[0.03] hover:text-[#b7c9bf]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => openFile(file.id)}
                          className="flex max-w-[160px] items-center gap-1.5"
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
                          <span className="truncate font-mono text-[12px] font-medium">
                            {file.label}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Fermer l’onglet"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(file.id);
                          }}
                          className={`rounded p-0.5 text-[10px] opacity-0 transition group-hover:opacity-100 ${
                            selected ? "hover:bg-white/10" : "hover:bg-white/5"
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
                    className="flex h-9 shrink-0 items-center px-2.5 text-[11px] text-[#5f766a] hover:text-[#d5e4db]"
                    title="Quick Open (Ctrl+P)"
                  >
                    +
                  </button>
                </div>
                {hasPendingHere ? (
                  <div className="flex items-center gap-1 px-2">
                    <button
                      type="button"
                      onClick={() => setDiffView("before")}
                      className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                        diffView === "before"
                          ? "bg-white/15 text-white"
                          : "text-[#7d9588] hover:text-white"
                      }`}
                    >
                      Avant
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiffView("after")}
                      className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
                        diffView === "after"
                          ? "bg-[#e8892a]/30 text-[#ffd7a8]"
                          : "text-[#7d9588] hover:text-white"
                      }`}
                    >
                      Après
                    </button>
                    <button
                      type="button"
                      onClick={acceptPending}
                      className="rounded bg-[#2f6b4f] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#3a7d5c]"
                    >
                      Accepter
                    </button>
                    {pendingList.length > 1 ? (
                      <button
                        type="button"
                        onClick={acceptAllPending}
                        className="rounded bg-[#e8892a] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#d67a1f]"
                      >
                        Tout ({pendingList.length})
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={rejectPending}
                      className="rounded bg-white/10 px-3 py-1 text-[11px] font-semibold text-[#d5e4db] hover:bg-white/15"
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

              {hasPendingHere ? (
                <div className="flex items-center justify-between gap-3 border-b border-[#e8892a]/35 bg-gradient-to-r from-[#e8892a]/15 to-transparent px-3 py-1.5">
                  <p className="text-[11px] text-[#ffd7a8]">
                    Diff IA · {countLines(pending!.before)} → {countLines(pending!.after)} lignes
                    — vérifie puis Accepte
                  </p>
                  <button
                    type="button"
                    onClick={() => setSplitDiff((v) => !v)}
                    className="rounded-lg border border-[#e8892a]/30 px-2 py-0.5 text-[10px] font-semibold text-[#ffd7a8] hover:bg-[#e8892a]/15"
                  >
                    {splitDiff ? "Vue simple" : "Côte à côte"}
                  </button>
                </div>
              ) : null}

              <div className="relative min-h-0 flex-1">
                {!editorValue.trim() && !hasPendingHere ? (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-8">
                    <div className="max-w-sm rounded-2xl border border-white/10 bg-[#0d1512]/90 px-5 py-4 text-center backdrop-blur-sm">
                      <p className="text-sm font-semibold text-[#eef6f1]">Fichier vide</p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-[#7d9588]">
                        {active.emptyHint}
                      </p>
                    </div>
                  </div>
                ) : null}
                {hasPendingHere && splitDiff && pending ? (
                  <div className="flex h-full min-h-0 flex-col lg:flex-row">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
                      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-3">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-red-300">
                          Avant
                        </span>
                        <span className="font-mono text-[10px] text-red-200/70">
                          {countLines(pending.before)} lignes
                        </span>
                      </div>
                      <div className="min-h-0 flex-1">
                        <MonacoEditor
                          height="100%"
                          language={active.language}
                          theme="vs-dark"
                          value={pending.before}
                          options={{
                            readOnly: true,
                            fontSize: 12.5,
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            wordWrap: "on",
                            tabSize: 2,
                            padding: { top: 10, bottom: 10 },
                            renderLineHighlight: "none",
                            lineNumbers: "on",
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[#3d8f68]/30 bg-[#1b4f3a]/25 px-3">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[#9fd4b5]">
                          Après
                        </span>
                        <span className="font-mono text-[10px] text-[#9fd4b5]/80">
                          {countLines(pending.after)} lignes
                        </span>
                      </div>
                      <div className="min-h-0 flex-1">
                        <MonacoEditor
                          height="100%"
                          language={active.language}
                          theme="vs-dark"
                          value={pending.after}
                          options={{
                            readOnly: true,
                            fontSize: 12.5,
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            wordWrap: "on",
                            tabSize: 2,
                            padding: { top: 10, bottom: 10 },
                            renderLineHighlight: "none",
                            lineNumbers: "on",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <MonacoEditor
                    height="100%"
                    language={active.language}
                    theme="vs-dark"
                    value={editorValue}
                    onChange={(v) => {
                      if (pending?.fileId === active.id) return;
                      onChangeFile(active.id, v ?? "");
                      markDirty(active.id);
                    }}
                    options={{
                      readOnly: hasPendingHere,
                      fontSize: 13.5,
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      wordWrap: "on",
                      tabSize: 2,
                      padding: { top: 14, bottom: 14 },
                      renderLineHighlight: "line",
                      smoothScrolling: true,
                      cursorBlinking: "smooth",
                      roundedSelection: true,
                    }}
                  />
                )}
              </div>

              {/* Status bar — clic Terminal comme Cursor */}
              <div className="flex h-[22px] shrink-0 items-center justify-between gap-3 border-t border-[#e8892a]/20 bg-gradient-to-r from-[#1b4f3a] via-[#245a44] to-[#1b4f3a] px-3 text-[10px] text-[#c8ddd2]">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">Okapi Studio</span>
                  <span>Ln {lineCount}</span>
                  <span className="uppercase">{active.language}</span>
                  <button
                    type="button"
                    onClick={() => openTerminal("terminal")}
                    className="rounded px-1 font-semibold hover:bg-white/10"
                    title="Ouvrir le terminal (Ctrl+`)"
                  >
                    Terminal
                  </button>
                  <button
                    type="button"
                    onClick={() => setCmdOpen(true)}
                    className="rounded px-1 font-semibold hover:bg-white/10"
                    title="Palette (Ctrl+Shift+P)"
                  >
                    Cmd
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(true)}
                    className="rounded px-1 font-semibold hover:bg-white/10"
                    title="Raccourcis (Ctrl+/)"
                  >
                    ?
                  </button>
                  {dirtyIds.size > 0 ? (
                    <span className="text-[#ffd7a8]">
                      {dirtyIds.size} modifié{dirtyIds.size > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  {aiBusy ? (
                    <span className="flex items-center gap-1.5 text-[#ffd7a8]">
                      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#e8892a]" />
                      Agent écrit…
                    </span>
                  ) : pending ? (
                    <span className="text-[#ffd7a8]">Diff en attente</span>
                  ) : null}
                  <span>UTF-8</span>
                  <span className="text-[#ffd7a8]">MMC SARL</span>
                </div>
              </div>
            </div>
          </div>

          {/* Terminal panel — style Cursor bas */}
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
                    {id === "problems" && pending ? (
                      <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e8892a]/30 px-1 text-[9px] font-bold text-[#ffd7a8]">
                        1
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
                  pending ? (
                    <div className="flex items-start gap-2 text-[#ffd7a8]">
                      <span className="mt-0.5 text-[#e8892a]">●</span>
                      <span>
                        Diff IA en attente sur {pending.fileId} — compare Avant/Après puis
                        Accepter ou Refuser.
                      </span>
                    </div>
                  ) : (
                    <p className="text-[#5f766a]">Aucun problème détecté.</p>
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
                    okapi ›
                  </span>
                  <input
                    ref={termInputRef}
                    value={termCmd}
                    onChange={(e) => setTermCmd(e.target.value)}
                    placeholder="help · status · preview · agent · open app.html"
                    className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-[#eef6f1] outline-none placeholder:text-[#4a5c54]"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </form>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Preview — right on lg, below editor on small */}
        {previewOpen ? (
          <div className="okapi-studio-panel flex max-h-[40vh] w-full shrink-0 flex-col border-t border-white/10 lg:max-h-none lg:w-[min(36%,420px)] lg:border-l lg:border-t-0">
            {/* Browser chrome */}
            <div className="okapi-studio-chrome flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7d9588]">
                Preview
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded border border-[#e8892a]/15 bg-[#06100c]/60 px-2 py-1">
                <span className="shrink-0 text-[10px] text-[#3d8f68]">●</span>
                <span className="min-w-0 truncate font-mono text-[11px] text-[#9bb0a4]">
                  {previewUrl}
                </span>
              </div>
              <button
                type="button"
                title="Actualiser"
                onClick={refreshPreview}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#7d9588] transition hover:bg-white/5 hover:text-[#d5e4db]"
              >
                <IconRefresh className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Fermer"
                onClick={() => setPreviewOpen(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#7d9588] transition hover:bg-white/5 hover:text-[#d5e4db]"
              >
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 bg-white">
              {html?.trim() ? (
                <iframe
                  key={previewKey}
                  title={`${title} preview`}
                  srcDoc={html}
                  sandbox="allow-scripts allow-forms allow-same-origin"
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
                  <p className="text-sm font-medium text-gray-500">Pas encore de preview</p>
                  <p className="text-xs text-gray-400">
                    Génère un HTML ou édite app.html
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Agent Cursor-style — toujours à droite du code */}
        {aiOpen ? (
          <aside className="okapi-studio-panel flex max-h-[46vh] w-full shrink-0 flex-col border-t border-white/10 lg:max-h-none lg:w-[min(40%,420px)] lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e8892a]">
                  Agent Okapi
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-[#b7c9bf]">
                  @{active.label}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="hidden rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-[#5f766a] sm:inline">
                  Ctrl+L
                </span>
                <span className="rounded-full bg-[#1b4f3a]/40 px-2 py-0.5 text-[9px] font-bold uppercase text-[#b8d4c6]">
                  {engine}
                </span>
                <button
                  type="button"
                  title="Réduire l’agent"
                  onClick={() => setAiOpen(false)}
                  className="rounded p-1 text-[#5f766a] hover:bg-white/5 hover:text-[#d5e4db]"
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
              {aiMessages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                    m.role === "user"
                      ? "ml-4 bg-[#1b4f3a]/45 text-[#eef6f1]"
                      : "mr-1 border border-white/5 bg-white/[0.03] text-[#b7c9bf]"
                  }`}
                >
                  {m.content}
                </div>
              ))}

              {pending && pendingFile ? (
                <div className="rounded-xl border border-[#e8892a]/40 bg-[#e8892a]/10 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#ffd7a8]">
                        {pendingList.length > 1
                          ? `Projet · ${pendingList.length} fichiers`
                          : "Diff en attente"}
                      </p>
                      <p className="mt-1 truncate font-mono text-[12px] text-[#eef6f1]">
                        {pendingFile.label}
                      </p>
                      <p className="mt-1 text-[11px] text-[#c9b896]">
                        {countLines(pending.before)} → {countLines(pending.after)} lignes
                        {pendingDelta !== 0
                          ? ` (${pendingDelta > 0 ? "+" : ""}${pendingDelta})`
                          : ""}
                      </p>
                    </div>
                    {pending.fileId !== active.id ? (
                      <button
                        type="button"
                        onClick={() => openFile(pending.fileId)}
                        className="shrink-0 rounded-lg border border-white/15 px-2 py-1 text-[10px] font-semibold text-[#d5e4db] hover:bg-white/5"
                      >
                        Ouvrir
                      </button>
                    ) : null}
                  </div>
                  {pendingList.length > 1 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pendingList.map((p) => (
                        <button
                          key={p.fileId}
                          type="button"
                          onClick={() => openFile(p.fileId)}
                          className={`rounded-md px-2 py-0.5 font-mono text-[10px] ${
                            p.fileId === pending.fileId
                              ? "bg-[#e8892a]/30 text-[#ffd7a8]"
                              : "bg-white/5 text-[#9bb0a4] hover:bg-white/10"
                          }`}
                        >
                          {p.fileId}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-2 text-[11px] leading-relaxed text-[#e8d9c0]">
                    {pending.note}
                  </p>
                  {pendingDiffLines.length > 0 ? (
                    <pre className="okapi-studio-code mt-2 max-h-36 overflow-auto rounded-lg border border-white/10 p-2 font-mono text-[10px] leading-relaxed">
                      {pendingDiffLines.map((line, idx) => (
                        <div
                          key={`${line.type}-${idx}`}
                          className={
                            line.type === "add"
                              ? "bg-[#1b4f3a]/35 text-[#9fd4b5]"
                              : line.type === "del"
                                ? "bg-red-500/15 text-red-300"
                                : "text-[#5f766a]"
                          }
                        >
                          <span className="inline-block w-3 select-none opacity-70">
                            {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                          </span>
                          {line.text || " "}
                        </div>
                      ))}
                    </pre>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (pending.fileId !== active.id) openFile(pending.fileId);
                        setDiffView("before");
                        setSplitDiff(false);
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                        hasPendingHere && diffView === "before"
                          ? "bg-white/20 text-white"
                          : "bg-white/5 text-[#b7c9bf] hover:bg-white/10"
                      }`}
                    >
                      Avant
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (pending.fileId !== active.id) openFile(pending.fileId);
                        setDiffView("after");
                        setSplitDiff(false);
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                        hasPendingHere && diffView === "after"
                          ? "bg-[#e8892a]/35 text-[#ffd7a8]"
                          : "bg-white/5 text-[#b7c9bf] hover:bg-white/10"
                      }`}
                    >
                      Après
                    </button>
                    <button
                      type="button"
                      onClick={acceptPending}
                      className="rounded-lg bg-[#2f6b4f] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#3a7d5c]"
                    >
                      Accepter
                    </button>
                    {pendingList.length > 1 ? (
                      <button
                        type="button"
                        onClick={acceptAllPending}
                        className="rounded-lg bg-[#e8892a] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#d67a1f]"
                      >
                        Accepter tout ({pendingList.length})
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={rejectPending}
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-[#d5e4db] hover:bg-white/15"
                    >
                      Refuser
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-[#8a7a62]">Échap = Refuser tout</p>
                </div>
              ) : null}

              {aiBusy ? (
                <p className="flex items-center gap-2 text-[11px] text-[#e8892a]">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#e8892a]" />
                  Okapi écrit le diff…
                </p>
              ) : null}
              {aiError ? (
                <p className="rounded-lg bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
                  {aiError}
                </p>
              ) : null}
              <div ref={chatEndRef} />
            </div>

            {!pending && !aiBusy ? (
              <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-3 py-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => useSuggestion(s)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-[#9bb0a4] transition hover:border-[#e8892a]/40 hover:text-[#ffd7a8]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}

            <form
              onSubmit={(e) => void askStudioAi(e)}
              className="border-t border-white/10 p-3"
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
                rows={3}
                disabled={Boolean(pendingList.length)}
                placeholder={
                  pendingList.length
                    ? "Accepte ou refuse le projet d’abord…"
                    : `Projet complet ou edit de ${active.label}…`
                }
                className="w-full resize-none rounded-xl border border-[#e8892a]/20 bg-[#06100c]/55 px-3 py-2.5 text-[12px] text-[#eef6f1] outline-none placeholder:text-[#5f766a] focus:border-[#2f6b4f] disabled:opacity-50"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={aiBusy || !aiPrompt.trim() || pendingList.length > 0}
                  className="flex-1 rounded-xl bg-[#e8892a] px-3 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#d67a1f] disabled:opacity-45"
                >
                  {aiBusy ? "Écriture…" : "Proposer / Générer"}
                </button>
                <span className="hidden text-[9px] text-[#5f766a] sm:inline">
                  Entrée
                </span>
              </div>
            </form>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAiOpen(true);
              window.setTimeout(() => aiInputRef.current?.focus(), 80);
            }}
            className="absolute bottom-4 right-4 z-30 flex items-center gap-2 rounded-2xl border border-[#e8892a]/40 bg-[#0d1512] px-4 py-3 text-sm font-semibold text-[#ffd7a8] shadow-lg shadow-black/40 transition hover:border-[#e8892a] hover:bg-[#15211c]"
            title="Ouvrir l’agent (Ctrl+L)"
          >
            <IconSpark className="h-4 w-4" />
            Agent
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-[#9bb0a4]">
              Ctrl+L
            </span>
          </button>
        )}
      </div>

      {/* Quick Open — Ctrl+P comme Cursor */}
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
                        {GROUP_LABEL[file.group]}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Command Palette — Ctrl+Shift+P comme Cursor */}
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
                  ["Ctrl+Shift+P", "Palette commandes"],
                  ["Ctrl+`", "Terminal"],
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
              Élève Okapi · comme chez le coach Cursor · MMC SARL
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
