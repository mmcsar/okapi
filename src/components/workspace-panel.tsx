"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StudioFileId } from "@/components/okapi-studio";
import { useOkapiPreviewBridge } from "@/hooks/use-okapi-preview-bridge";
import {
  OKAPI_PREVIEW_SANDBOX,
  injectOkapiRuntime,
} from "@/lib/okapi-runtime";

const OkapiStudio = dynamic(
  () =>
    import("@/components/okapi-studio").then((m) => m.OkapiStudio),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center okapi-studio-shell text-sm text-[var(--okapi-studio-muted)]">
        Ouverture Okapi Studio…
      </div>
    ),
  },
);

export type WorkspaceTab =
  | "preview"
  | "studio"
  | "code"
  | "sql"
  | "api"
  | "docs";

type WorkspacePanelProps = {
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
  sending: boolean;
  device: "mobile" | "desktop";
  onDeviceChange: (device: "mobile" | "desktop") => void;
  shareBusy: boolean;
  shareUrl: string | null;
  onShare: () => void;
  onExportHtml: () => void;
  onExportSql: () => void;
  onExportApi: () => void;
  onExportReadme: () => void;
  onExportZip?: () => void;
  onChangeArtifact: (id: StudioFileId, value: string) => void;
  onSaveCloud?: () => void | Promise<boolean>;
  onStudioCommitted?: (fileId: StudioFileId, content: string) => void;
  cloudStatus?: string | null;
  engine?: string;
  /** Secteur Accueil pour agents métier Studio */
  sector?: string;
  /** Projet cloud — active Preview données réelles */
  projectId?: string | null;
  accessToken?: string | null;
  /** Bump when a new generation finishes to focus Preview */
  focusPreviewKey?: number;
  /** Bump to open Studio (mode Dev) */
  focusStudioKey?: number;
  /** Seed Agent Studio after Accueil generate */
  studioSeedKey?: number;
  studioSeedMessages?: { role: "user" | "assistant"; content: string }[];
  /** Mode Studio immersif : full-bleed, chrome minimal */
  immersive?: boolean;
};

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "studio", label: "Studio" },
  { id: "code", label: "Code" },
  { id: "sql", label: "SQL" },
  { id: "api", label: "API" },
  { id: "docs", label: "Docs" },
];

function CodeView({
  value,
  empty,
  languageLabel,
  dark = false,
}: {
  value: string | null;
  empty: string;
  languageLabel: string;
  dark?: boolean;
}) {
  if (!value) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center">
        <p
          className={`font-[family-name:var(--font-syne)] text-base font-bold ${
            dark ? "text-[#c8ddd2]/70" : "text-okapi-ink/45"
          }`}
        >
          Pas encore de {languageLabel}
        </p>
        <p
          className={`mt-2 max-w-sm text-sm ${
            dark ? "text-[#8aa89a]" : "text-okapi-ink/40"
          }`}
        >
          {empty}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex items-center justify-between border-b px-3 py-1.5 ${
          dark ? "border-white/10" : "border-[var(--okapi-stroke)]"
        }`}
      >
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
            dark ? "text-[#8aa89a]" : "text-okapi-ink/35"
          }`}
        >
          {languageLabel}
        </span>
        <span className={`text-[10px] ${dark ? "text-[#5f766a]" : "text-okapi-ink/30"}`}>
          {value.length.toLocaleString("fr-FR")} car.
        </span>
      </div>
      <pre className="okapi-studio-code min-h-0 flex-1 overflow-auto p-4 text-[12px] leading-relaxed">
        <code className="whitespace-pre-wrap break-words font-mono">{value}</code>
      </pre>
    </div>
  );
}

export function WorkspacePanel({
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
  sending,
  device,
  onDeviceChange,
  shareBusy,
  shareUrl,
  onShare,
  onExportHtml,
  onExportSql,
  onExportApi,
  onExportReadme,
  onExportZip,
  onChangeArtifact,
  onSaveCloud,
  onStudioCommitted,
  cloudStatus = null,
  engine = "flash",
  sector,
  projectId = null,
  accessToken = null,
  focusPreviewKey = 0,
  focusStudioKey = 0,
  studioSeedKey = 0,
  studioSeedMessages,
  immersive = false,
}: WorkspacePanelProps) {
  const [tab, setTab] = useState<WorkspaceTab>(immersive ? "studio" : "preview");
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  useOkapiPreviewBridge(previewIframeRef, projectId);

  const liveHtml = useMemo(() => {
    if (!html) return html;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return injectOkapiRuntime(html, {
      projectId: projectId ?? null,
      parentOrigin: origin,
    });
  }, [html, projectId]);

  useEffect(() => {
    if (focusPreviewKey > 0) setTab("preview");
  }, [focusPreviewKey]);

  useEffect(() => {
    if (focusStudioKey > 0) setTab("studio");
  }, [focusStudioKey]);

  useEffect(() => {
    if (immersive) setTab("studio");
  }, [immersive]);

  const exportForTab = () => {
    if (tab === "preview" || tab === "code" || tab === "studio") onExportHtml();
    else if (tab === "sql") onExportSql();
    else if (tab === "api") onExportApi();
    else onExportReadme();
  };

  const canExport = Boolean(
    html ||
      react ||
      reactNative ||
      nextjs ||
      sql ||
      api ||
      python ||
      flutter ||
      readme,
  );

  const exportLabel =
    tab === "sql"
      ? "Exporter SQL"
      : tab === "api"
        ? "Exporter API"
        : tab === "docs"
          ? "Exporter Docs"
          : "Exporter HTML";

  const studioBleed = immersive;

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col lg:min-h-0 ${
        studioBleed
          ? "okapi-studio-shell min-h-[48vh]"
          : "min-h-[48vh] bg-[linear-gradient(180deg,rgba(223,230,225,0.85),rgba(232,238,233,0.9))]"
      }`}
    >
      {studioBleed ? (
        <div className="okapi-studio-chrome flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5">
          <div className="flex items-center gap-1">
            {(
              [
                ["studio", "Studio"],
                ["preview", "Preview"],
                ["sql", "SQL"],
                ["api", "API"],
                ["docs", "Docs"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                  tab === id
                    ? "bg-white/10 text-[#eef6f1]"
                    : "text-[#7d9588] hover:bg-white/5 hover:text-[#d5e4db]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {onSaveCloud ? (
              <button
                type="button"
                onClick={onSaveCloud}
                className="rounded-lg bg-[#1b4f3a] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#2f6b4f]"
              >
                Sauvegarder
              </button>
            ) : null}
            {cloudStatus ? (
              <span className="max-w-[120px] truncate text-[10px] text-[#7d9588]">
                {cloudStatus}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--okapi-stroke)] px-3 py-2 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {TABS.map((item) => {
            const active = tab === item.id;
            const badge =
              item.id === "sql"
                ? sql
                : item.id === "api"
                  ? api
                  : item.id === "docs"
                    ? readme
                    : item.id === "code" || item.id === "studio"
                      ? html || react || reactNative || nextjs
                      : true;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? item.id === "studio"
                      ? "bg-[#0f1a14] text-white"
                      : "bg-okapi-forest text-white"
                    : "text-okapi-ink/50 hover:bg-white/70 hover:text-okapi-ink"
                }`}
              >
                {item.label}
                {badge && item.id !== "preview" ? (
                  <span
                    className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${
                      active ? "bg-okapi-amber" : "bg-okapi-leaf"
                    }`}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {onSaveCloud ? (
            <button
              type="button"
              onClick={onSaveCloud}
              className="rounded-xl bg-okapi-forest px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-okapi-leaf"
              title="Sauvegarder tous les fichiers sur ton compte"
            >
              Sauvegarder
            </button>
          ) : null}
          {cloudStatus ? (
            <span className="max-w-[140px] truncate text-[10px] font-medium text-okapi-ink/45">
              {cloudStatus}
            </span>
          ) : null}
          {canExport && onExportZip ? (
            <button
              type="button"
              onClick={onExportZip}
              className="rounded-xl border border-okapi-forest/30 bg-okapi-forest/10 px-3 py-1.5 text-[11px] font-semibold text-okapi-forest hover:bg-okapi-forest/15"
            >
              ZIP projet
            </button>
          ) : null}
          {canExport ? (
            <button
              type="button"
              onClick={exportForTab}
              className="rounded-xl border border-[var(--okapi-stroke)] bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-okapi-ink/70 hover:bg-white"
            >
              {exportLabel}
            </button>
          ) : null}

          {html ? (
            <button
              type="button"
              onClick={onShare}
              disabled={shareBusy}
              className="rounded-xl bg-okapi-forest px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
            >
              {shareBusy ? "…" : shareUrl ? "Lien prêt" : "Partager"}
            </button>
          ) : null}

          {tab === "preview" ? (
            <div className="flex rounded-full border border-[var(--okapi-stroke)] bg-white/70 p-0.5 sm:hidden">
              <button
                type="button"
                onClick={() => onDeviceChange("mobile")}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  device === "mobile"
                    ? "bg-okapi-forest text-white"
                    : "text-okapi-ink/50"
                }`}
              >
                Mobile
              </button>
              <button
                type="button"
                onClick={() => onDeviceChange("desktop")}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  device === "desktop"
                    ? "bg-okapi-forest text-white"
                    : "text-okapi-ink/50"
                }`}
              >
                Desktop
              </button>
            </div>
          ) : null}

          <p className="hidden text-[11px] text-okapi-ink/35 sm:block">
            {sending
              ? "En cours…"
              : tab === "studio"
                ? "Studio Dev"
                : title.slice(0, 28)}
          </p>
        </div>
      </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "studio" ? (
          <OkapiStudio
            title={title}
            html={html}
            react={react}
            reactNative={reactNative}
            nextjs={nextjs}
            sql={sql}
            api={api}
            python={python}
            flutter={flutter}
            readme={readme}
            showPreview
            engine={engine}
            sector={sector}
            projectId={projectId}
            accessToken={accessToken}
            seedKey={studioSeedKey}
            seedMessages={studioSeedMessages}
            onChangeFile={onChangeArtifact}
            onCommitted={onStudioCommitted}
            onSaveCloud={onSaveCloud}
          />
        ) : null}

        {tab === "preview" ? (
          <div className="flex flex-1 items-center justify-center overflow-auto p-4 lg:p-6">
            {sending && !html ? (
              <div
                className={`preview-shimmer flex flex-col items-center justify-center rounded-[28px] border border-[var(--okapi-stroke)] ${
                  device === "mobile"
                    ? "h-[640px] w-full max-w-[360px]"
                    : "h-[min(720px,100%)] w-full max-w-4xl"
                }`}
              >
                <p className="font-[family-name:var(--font-syne)] text-lg font-bold text-okapi-ink/50">
                  Okapi construit…
                </p>
                <p className="mt-2 text-sm text-okapi-ink/35">
                  Preview · Studio · Code · SQL
                </p>
              </div>
            ) : html ? (
              <div
                className={
                  device === "mobile"
                    ? "phone-frame h-[min(720px,100%)] w-full max-w-[360px]"
                    : "h-full w-full max-w-5xl overflow-hidden rounded-[24px] border border-[var(--okapi-stroke)] bg-white"
                }
              >
                <iframe
                  ref={previewIframeRef}
                  title={title}
                  srcDoc={liveHtml || ""}
                  sandbox={OKAPI_PREVIEW_SANDBOX}
                  referrerPolicy="no-referrer"
                  className={`w-full bg-white ${
                    device === "mobile"
                      ? "h-[640px] pt-6"
                      : "h-full min-h-[560px]"
                  }`}
                />
              </div>
            ) : (
              <p
                className={`text-sm ${
                  immersive ? "text-[#8aa89a]" : "text-okapi-ink/40"
                }`}
              >
                La preview apparaîtra ici.
              </p>
            )}
          </div>
        ) : null}

        {tab === "code" ? (
          <CodeView
            value={html}
            languageLabel="HTML"
            empty="Génère une app pour voir le code source ici."
            dark={immersive}
          />
        ) : null}

        {tab === "sql" ? (
          <CodeView
            value={sql}
            languageLabel="Schéma SQL"
            empty="Demande un projet fullstack (auth, base, CRUD…) pour générer le schéma."
            dark={immersive}
          />
        ) : null}

        {tab === "api" ? (
          <CodeView
            value={api}
            languageLabel="API TypeScript"
            empty="Les routes API apparaissent en mode fullstack."
            dark={immersive}
          />
        ) : null}

        {tab === "docs" ? (
          <CodeView
            value={readme}
            languageLabel="README"
            empty="Le guide d’installation apparaît avec un projet fullstack."
            dark={immersive}
          />
        ) : null}
      </div>
    </section>
  );
}
