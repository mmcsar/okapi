"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#0f1a14] text-sm text-[#8aa396]">
      Chargement Okapi Studio…
    </div>
  ),
});

export type StudioFileId = "app.html" | "schema.sql" | "api.ts" | "README.md";

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
  sql: string | null;
  api: string | null;
  readme: string | null;
  showPreview: boolean;
  onChangeFile: (id: StudioFileId, value: string) => void;
};

export function OkapiStudio({
  title,
  html,
  sql,
  api,
  readme,
  showPreview,
  onChangeFile,
}: OkapiStudioProps) {
  const files = useMemo<StudioFile[]>(
    () => [
      {
        id: "app.html",
        label: "app.html",
        language: "html",
        value: html ?? "",
        emptyHint: "Génère une app pour éditer le HTML ici.",
      },
      {
        id: "schema.sql",
        label: "schema.sql",
        language: "sql",
        value: sql ?? "",
        emptyHint: "Schéma SQL (fullstack) — editable.",
      },
      {
        id: "api.ts",
        label: "api.ts",
        language: "typescript",
        value: api ?? "",
        emptyHint: "Routes API — editable.",
      },
      {
        id: "README.md",
        label: "README.md",
        language: "markdown",
        value: readme ?? "",
        emptyHint: "Docs du projet.",
      },
    ],
    [html, sql, api, readme],
  );

  const [activeId, setActiveId] = useState<StudioFileId>("app.html");
  const active = files.find((f) => f.id === activeId) ?? files[0];

  useEffect(() => {
    // Prefer first file that has content
    const preferred =
      files.find((f) => f.value.trim())?.id ?? ("app.html" as StudioFileId);
    setActiveId((prev) => {
      const still = files.find((f) => f.id === prev);
      if (still?.value.trim()) return prev;
      return preferred;
    });
  }, [files]);

  return (
    <div className="flex h-full min-h-[420px] flex-1 overflow-hidden bg-[#0b1410] text-[#d7e6dc]">
      {/* Activity + explorer */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/10 bg-[#0f1a14]">
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
                    has ? "bg-[#e8892a]" : "bg-white/20"
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

      {/* Editor + optional preview */}
      <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-white/10 bg-[#121f19] px-2 py-1">
            <span className="rounded-md bg-white/5 px-2.5 py-1 font-mono text-[11px] text-[#e8f2ec]">
              {active.label}
            </span>
            <span className="ml-auto text-[10px] text-[#6f857a]">
              {active.value
                ? `${active.value.length.toLocaleString("fr-FR")} car.`
                : "vide"}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            {active.value.trim() || active.id === "app.html" ? (
              <MonacoEditor
                height="100%"
                language={active.language}
                theme="vs-dark"
                value={active.value}
                onChange={(v) => onChangeFile(active.id, v ?? "")}
                options={{
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
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#8aa396]">
                {active.emptyHint}
              </div>
            )}
          </div>
        </div>

        {showPreview ? (
          <div className="flex min-h-[240px] w-full flex-col border-t border-white/10 lg:min-h-0 lg:w-[42%] lg:border-l lg:border-t-0">
            <div className="border-b border-white/10 bg-[#121f19] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8aa396]">
              Preview
            </div>
            <div className="min-h-0 flex-1 bg-white">
              {html?.trim() ? (
                <iframe
                  title={`${title} preview`}
                  srcDoc={html}
                  sandbox="allow-scripts allow-forms allow-same-origin"
                  className="h-full min-h-[240px] w-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-okapi-ink/40">
                  Pas encore de preview
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
