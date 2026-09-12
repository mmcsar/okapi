"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#0c1210] text-sm text-[#7d9588]">
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
};

type AiMsg = { role: "user" | "assistant"; content: string };

type PendingEdit = {
  fileId: StudioFileId;
  before: string;
  after: string;
  note: string;
};

const GROUP_LABEL: Record<StudioFile["group"], string> = {
  web: "Web",
  mobile: "Mobile",
  data: "Backend",
  docs: "Docs",
};

const SUGGESTIONS = [
  "Ajoute un header responsive",
  "Crée un formulaire login",
  "Améliore le design mobile",
  "Ajoute validation + états vides",
];

function countLines(text: string) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
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
  showPreview,
  engine = "flash",
  onChangeFile,
  onCommitted,
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
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(showPreview);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingEdit | null>(null);
  const [diffView, setDiffView] = useState<"after" | "before">("after");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([
    {
      role: "assistant",
      content:
        "Studio prêt. Choisis un fichier, décris le changement — je propose un diff à Accepter ou Refuser.",
    },
  ]);

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

  useEffect(() => {
    const preferred =
      files.find((f) => f.value.trim())?.id ?? ("app.html" as StudioFileId);
    setActiveId((prev) => {
      const still = files.find((f) => f.id === prev);
      if (still?.value.trim()) return prev;
      return preferred;
    });
  }, [files]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, aiBusy]);

  const editorValue =
    pending && pending.fileId === active.id
      ? diffView === "before"
        ? pending.before
        : pending.after
      : active.value;

  const lineCount = countLines(editorValue);
  const hasPendingHere = Boolean(pending && pending.fileId === active.id);

  async function askStudioAi(e: FormEvent) {
    e.preventDefault();
    const instruction = aiPrompt.trim();
    if (!instruction || aiBusy || pending) return;

    setAiBusy(true);
    setAiError(null);
    setAiPrompt("");
    setAiMessages((prev) => [...prev, { role: "user", content: instruction }]);

    try {
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
        return;
      }

      setPending({
        fileId: active.id,
        before: active.value,
        after: data.content,
        note: data.note || `Proposition pour ${active.label}`,
      });
      setDiffView("after");
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `${data.note || "Proposition prête."} Compare Avant / Après, puis Accepte.`,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur IA Studio";
      setAiError(msg);
      setAiMessages((prev) => [...prev, { role: "assistant", content: msg }]);
    } finally {
      setAiBusy(false);
    }
  }

  function acceptPending() {
    if (!pending) return;
    onChangeFile(pending.fileId, pending.after);
    setAiMessages((prev) => [
      ...prev,
      { role: "assistant", content: `✓ ${pending.fileId} accepté et prêt pour le cloud.` },
    ]);
    const { fileId, after } = pending;
    setPending(null);
    onCommitted?.(fileId, after);
  }

  function rejectPending() {
    if (!pending) return;
    setAiMessages((prev) => [
      ...prev,
      { role: "assistant", content: `Proposition refusée pour ${pending.fileId}.` },
    ]);
    setPending(null);
    setDiffView("after");
  }

  function useSuggestion(text: string) {
    if (pending || aiBusy) return;
    setAiPrompt(text);
  }

  return (
    <div className="flex h-full min-h-[480px] flex-1 overflow-hidden bg-[#0a100e] text-[#d5e4db]">
      {/* Activity bar */}
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-[#07110d] py-2">
        <button
          type="button"
          title="Explorateur"
          onClick={() => setExplorerOpen((v) => !v)}
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${
            explorerOpen
              ? "bg-[#1b4f3a]/50 text-[#e8f2ec]"
              : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
          }`}
        >
          <IconExplorer className="h-5 w-5" />
        </button>
        <button
          type="button"
          title="IA Studio"
          onClick={() => setAiOpen((v) => !v)}
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${
            aiOpen
              ? "bg-[#e8892a]/25 text-[#ffd7a8]"
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
              ? "bg-[#1b4f3a]/50 text-[#e8f2ec]"
              : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
          }`}
        >
          <IconPreview className="h-5 w-5" />
        </button>
        <div className="mt-auto px-1 pb-1 text-center text-[9px] font-bold uppercase tracking-wider text-[#5f766a]">
          OK
        </div>
      </div>

      {/* Explorer */}
      {explorerOpen ? (
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/10 bg-[#0d1512]">
          <div className="border-b border-white/10 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7d9588]">
              Explorateur
            </p>
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
                      onClick={() => setActiveId(file.id)}
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

      {/* Editor column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Tabs */}
            <div className="flex items-stretch border-b border-white/10 bg-[#0f1814]">
              <div className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto">
                <div className="flex h-9 items-center gap-2 border-r border-white/10 bg-[#15221c] px-3">
                  <span className="font-mono text-[12px] font-medium text-[#eef6f1]">
                    {active.label}
                  </span>
                  <span className="rounded bg-[#1b4f3a]/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#b8d4c6]">
                    {active.badge}
                  </span>
                </div>
              </div>
              {hasPendingHere ? (
                <div className="flex items-center gap-1 px-2">
                  <button
                    type="button"
                    onClick={() => setDiffView("before")}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
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
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
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
                    className="rounded-md bg-[#2f6b4f] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#3a7d5c]"
                  >
                    Accepter
                  </button>
                  <button
                    type="button"
                    onClick={rejectPending}
                    className="rounded-md bg-white/10 px-3 py-1 text-[11px] font-semibold text-[#d5e4db] hover:bg-white/15"
                  >
                    Refuser
                  </button>
                </div>
              ) : null}
            </div>

            {hasPendingHere ? (
              <div className="flex items-center justify-between gap-3 border-b border-[#e8892a]/35 bg-gradient-to-r from-[#e8892a]/15 to-transparent px-3 py-2">
                <p className="text-[12px] text-[#ffd7a8]">
                  Diff IA · {countLines(pending!.before)} →{" "}
                  {countLines(pending!.after)} lignes — vérifie puis Accepte
                </p>
              </div>
            ) : null}

            <div className="relative min-h-0 flex-1">
              {!editorValue.trim() && !hasPendingHere ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-8">
                  <div className="max-w-sm rounded-2xl border border-white/10 bg-[#0d1512]/90 px-5 py-4 text-center backdrop-blur-sm">
                    <p className="text-sm font-semibold text-[#eef6f1]">
                      Fichier vide
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[#7d9588]">
                      {active.emptyHint}
                    </p>
                  </div>
                </div>
              ) : null}
              <MonacoEditor
                height="100%"
                language={active.language}
                theme="vs-dark"
                value={editorValue}
                onChange={(v) => {
                  if (pending) return;
                  onChangeFile(active.id, v ?? "");
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
            </div>

            {/* Status bar */}
            <div className="flex h-7 items-center justify-between gap-3 border-t border-white/10 bg-[#07110d] px-3 text-[10px] text-[#7d9588]">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-[#3d8f68]">Okapi Studio</span>
                <span>Ln {lineCount}</span>
                <span className="uppercase">{active.language}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>UTF-8</span>
                <span className="text-[#e8892a]">MMC SARL</span>
              </div>
            </div>
          </div>

          {/* AI panel */}
          {aiOpen ? (
            <div className="flex min-h-[240px] w-full flex-col border-t border-white/10 bg-[#0d1512] lg:min-h-0 lg:w-[320px] lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e8892a]">
                    IA Studio
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#b7c9bf]">
                    {active.label}
                  </p>
                </div>
                <span className="rounded-full bg-[#1b4f3a]/40 px-2 py-0.5 text-[9px] font-bold uppercase text-[#b8d4c6]">
                  {engine}
                </span>
              </div>

              <div className="scrollbar-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
                {aiMessages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                      m.role === "user"
                        ? "ml-4 bg-[#1b4f3a]/45 text-[#eef6f1]"
                        : "mr-2 border border-white/5 bg-white/[0.03] text-[#b7c9bf]"
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
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
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={2}
                  disabled={Boolean(pending)}
                  placeholder={
                    pending
                      ? "Accepte ou refuse le diff d’abord…"
                      : `Ex: ajoute un formulaire login dans ${active.label}`
                  }
                  className="w-full resize-none rounded-xl border border-white/10 bg-[#0a100e] px-3 py-2.5 text-[12px] text-[#eef6f1] outline-none placeholder:text-[#5f766a] focus:border-[#2f6b4f] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={aiBusy || !aiPrompt.trim() || Boolean(pending)}
                  className="mt-2 w-full rounded-xl bg-[#e8892a] px-3 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#d67a1f] disabled:opacity-45"
                >
                  {aiBusy ? "Écriture…" : "Proposer un diff"}
                </button>
              </form>
            </div>
          ) : null}

          {/* Preview */}
          {previewOpen ? (
            <div className="flex min-h-[220px] w-full flex-col border-t border-white/10 bg-[#0d1512] lg:min-h-0 lg:w-[36%] lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d9588]">
                  Preview HTML
                </p>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="text-[10px] font-semibold text-[#5f766a] hover:text-[#d5e4db]"
                >
                  Fermer
                </button>
              </div>
              <div className="min-h-0 flex-1 bg-white">
                {html?.trim() ? (
                  <iframe
                    title={`${title} preview`}
                    srcDoc={html}
                    sandbox="allow-scripts allow-forms allow-same-origin"
                    className="h-full min-h-[220px] w-full"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
                    <p className="text-sm font-medium text-okapi-ink/50">
                      Pas encore de preview
                    </p>
                    <p className="text-xs text-okapi-ink/35">
                      Génère un HTML ou édite app.html
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
