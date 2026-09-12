"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type FormEvent } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#0f1a14] text-sm text-[#8aa396]">
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
};

type AiMsg = { role: "user" | "assistant"; content: string };

type PendingEdit = {
  fileId: StudioFileId;
  before: string;
  after: string;
  note: string;
};

function countLines(text: string) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
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
}: OkapiStudioProps) {
  const files = useMemo<StudioFile[]>(
    () => [
      {
        id: "app.html",
        label: "app.html",
        language: "html",
        value: html ?? "",
        emptyHint: "Génère une app ou demande à l’IA Studio.",
      },
      {
        id: "App.tsx",
        label: "App.tsx",
        language: "typescript",
        value: react ?? "",
        emptyHint: "React web — « crée un composant login ».",
      },
      {
        id: "App.native.tsx",
        label: "App.native.tsx",
        language: "typescript",
        value: reactNative ?? "",
        emptyHint: "React Native — « écran mobile boutique Kinshasa ».",
      },
      {
        id: "app/page.tsx",
        label: "app/page.tsx",
        language: "typescript",
        value: nextjs ?? "",
        emptyHint: "Next.js App Router — « page d’accueil e-commerce ».",
      },
      {
        id: "schema.sql",
        label: "schema.sql",
        language: "sql",
        value: sql ?? "",
        emptyHint: "SQL / backend data — tables, index, RLS.",
      },
      {
        id: "api.ts",
        label: "api.ts",
        language: "typescript",
        value: api ?? "",
        emptyHint: "Backend API (routes TS / Next route.ts).",
      },
      {
        id: "main.py",
        label: "main.py",
        language: "python",
        value: python ?? "",
        emptyHint: "Backend Python — FastAPI / scripts.",
      },
      {
        id: "main.dart",
        label: "main.dart",
        language: "dart",
        value: flutter ?? "",
        emptyHint: "Flutter mobile.",
      },
      {
        id: "README.md",
        label: "README.md",
        language: "markdown",
        value: readme ?? "",
        emptyHint: "Docs du projet.",
      },
    ],
    [html, react, reactNative, nextjs, sql, api, python, flutter, readme],
  );

  const [activeId, setActiveId] = useState<StudioFileId>("app.html");
  const active = files.find((f) => f.id === activeId) ?? files[0];
  const [aiOpen, setAiOpen] = useState(true);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingEdit | null>(null);
  const [diffView, setDiffView] = useState<"after" | "before">("after");
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([
    {
      role: "assistant",
      content:
        "Je propose un diff : tu vois le code, puis tu Acceptes ou Refuses. React, Next.js, Python, Flutter, HTML…",
    },
  ]);

  useEffect(() => {
    const preferred =
      files.find((f) => f.value.trim())?.id ?? ("app.html" as StudioFileId);
    setActiveId((prev) => {
      const still = files.find((f) => f.id === prev);
      if (still?.value.trim()) return prev;
      return preferred;
    });
  }, [files]);

  const editorValue =
    pending && pending.fileId === active.id
      ? diffView === "before"
        ? pending.before
        : pending.after
      : active.value;

  async function askStudioAi(e: FormEvent) {
    e.preventDefault();
    const instruction = aiPrompt.trim();
    if (!instruction || aiBusy || pending) return;

    setAiBusy(true);
    setAiError(null);
    setAiPrompt("");
    setAiMessages((prev) => [
      ...prev,
      { role: "user", content: instruction },
    ]);

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
          content: `${data.note || "Proposition prête."} Vérifie le diff puis Accepte ou Refuse.`,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur IA Studio";
      setAiError(msg);
      setAiMessages((prev) => [
        ...prev,
        { role: "assistant", content: msg },
      ]);
    } finally {
      setAiBusy(false);
    }
  }

  function acceptPending() {
    if (!pending) return;
    onChangeFile(pending.fileId, pending.after);
    setAiMessages((prev) => [
      ...prev,
      { role: "assistant", content: `✓ ${pending.fileId} accepté.` },
    ]);
    setPending(null);
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

  return (
    <div className="flex h-full min-h-[420px] flex-1 overflow-hidden bg-[#0b1410] text-[#d7e6dc]">
      <aside className="flex w-[200px] shrink-0 flex-col border-r border-white/10 bg-[#0f1a14]">
        <div className="border-b border-white/10 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8aa396]">
            Explorateur
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-[#e8f2ec]">
            {title || "Projet Okapi"}
          </p>
        </div>
        <nav className="flex-1 overflow-auto p-1.5">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#6f857a]">
            src
          </p>
          {files.map((file) => {
            const activeFile = file.id === activeId;
            const has = Boolean(file.value.trim());
            const hasPending = pending?.fileId === file.id;
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => setActiveId(file.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition ${
                  activeFile
                    ? "bg-[#1b4f3a] text-white"
                    : "text-[#b7c9bf] hover:bg-white/5"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    hasPending
                      ? "bg-[#e8892a] animate-pulse"
                      : has
                        ? "bg-[#e8892a]"
                        : "bg-white/20"
                  }`}
                />
                <span className="truncate font-mono">{file.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-3 py-2 text-[10px] text-[#6f857a]">
          Okapi Studio · MMC SARL
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-[#121f19] px-2 py-1">
            <span className="rounded-md bg-white/5 px-2.5 py-1 font-mono text-[11px] text-[#e8f2ec]">
              {active.label}
            </span>
            {pending && pending.fileId === active.id ? (
              <>
                <button
                  type="button"
                  onClick={() => setDiffView("before")}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                    diffView === "before"
                      ? "bg-white/15 text-white"
                      : "text-[#8aa396]"
                  }`}
                >
                  Avant
                </button>
                <button
                  type="button"
                  onClick={() => setDiffView("after")}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                    diffView === "after"
                      ? "bg-[#e8892a]/30 text-[#ffd7a8]"
                      : "text-[#8aa396]"
                  }`}
                >
                  Après (IA)
                </button>
                <span className="text-[10px] text-[#8aa396]">
                  {countLines(pending.before)} → {countLines(pending.after)} lignes
                </span>
                <button
                  type="button"
                  onClick={acceptPending}
                  className="rounded-md bg-[#2f6b4f] px-2.5 py-1 text-[10px] font-bold text-white"
                >
                  Accepter
                </button>
                <button
                  type="button"
                  onClick={rejectPending}
                  className="rounded-md bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-[#d7e6dc]"
                >
                  Refuser
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setAiOpen((v) => !v)}
              className="ml-auto rounded-md bg-[#1b4f3a] px-2.5 py-1 text-[10px] font-semibold text-white"
            >
              {aiOpen ? "Masquer IA" : "IA Studio"}
            </button>
          </div>

          {pending && pending.fileId === active.id ? (
            <div className="border-b border-[#e8892a]/40 bg-[#e8892a]/10 px-3 py-1.5 text-[11px] text-[#ffd7a8]">
              Proposition IA en attente — compare Avant / Après, puis Accepte ou Refuse.
            </div>
          ) : null}

          <div className="min-h-0 flex-1">
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
                readOnly: Boolean(pending && pending.fileId === active.id),
                fontSize: 13,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                tabSize: 2,
                padding: { top: 12 },
                renderLineHighlight: "line",
                smoothScrolling: true,
              }}
            />
          </div>
        </div>

        {aiOpen ? (
          <div className="flex min-h-[220px] w-full flex-col border-t border-white/10 bg-[#0f1a14] lg:min-h-0 lg:w-[300px] lg:border-l lg:border-t-0">
            <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8aa396]">
              IA Studio · {active.label}
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {aiMessages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={`rounded-xl px-2.5 py-2 text-[12px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-[#1b4f3a]/40 text-[#e8f2ec]"
                      : "bg-white/5 text-[#b7c9bf]"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {aiBusy ? (
                <p className="text-[11px] text-[#8aa396]">Okapi code…</p>
              ) : null}
              {aiError ? (
                <p className="text-[11px] text-red-300">{aiError}</p>
              ) : null}
            </div>
            <form
              onSubmit={(e) => void askStudioAi(e)}
              className="border-t border-white/10 p-2"
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
                className="w-full resize-none rounded-xl border border-white/10 bg-[#0b1410] px-3 py-2 text-[12px] text-[#e8f2ec] outline-none placeholder:text-[#6f857a] focus:border-[#2f6b4f] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={aiBusy || !aiPrompt.trim() || Boolean(pending)}
                className="mt-2 w-full rounded-xl bg-[#e8892a] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                {aiBusy ? "Écriture…" : "Proposer un diff"}
              </button>
            </form>
          </div>
        ) : null}

        {showPreview ? (
          <div className="flex min-h-[200px] w-full flex-col border-t border-white/10 lg:min-h-0 lg:w-[34%] lg:border-l lg:border-t-0">
            <div className="border-b border-white/10 bg-[#121f19] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8aa396]">
              Preview HTML
            </div>
            <div className="min-h-0 flex-1 bg-white">
              {html?.trim() ? (
                <iframe
                  title={`${title} preview`}
                  srcDoc={html}
                  sandbox="allow-scripts allow-forms allow-same-origin"
                  className="h-full min-h-[200px] w-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-okapi-ink/40">
                  Preview HTML (App.tsx / Flutter / Python = code seul)
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
