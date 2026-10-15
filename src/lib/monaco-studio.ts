/**
 * Monaco TypeScript / JSON diagnostics for Okapi Studio.
 * Browser worker only — not a full project tsc.
 */

import type { StudioFileId } from "@/lib/studio-files";
import type {
  StudioProblem,
  StudioProblemSeverity,
} from "@/lib/studio-problems";

/** Minimal React + JSX ambient so App.tsx / page.tsx don't flood with noise. */
const REACT_STUB = `
declare namespace React {
  type ReactNode = any;
  type FC<P = {}> = (props: P & { children?: ReactNode }) => ReactNode | null;
  interface SyntheticEvent<T = Element> {
    target: EventTarget & T;
    preventDefault(): void;
    stopPropagation(): void;
  }
  type FormEvent<T = Element> = SyntheticEvent<T>;
  type ChangeEvent<T = Element> = SyntheticEvent<T>;
  type MouseEvent<T = Element> = SyntheticEvent<T>;
  function useState<S>(initial: S | (() => S)): [S, (v: S | ((prev: S) => S)) => void];
  function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;
  function useMemo<T>(factory: () => T, deps: ReadonlyArray<unknown>): T;
  function useCallback<T extends (...args: any[]) => any>(fn: T, deps: ReadonlyArray<unknown>): T;
  function useRef<T>(initial: T): { current: T };
  function createElement(type: any, props?: any, ...children: any[]): any;
  const Fragment: any;
}
declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
declare const React: any;
export {};
`.trim();

const OKAPI_WINDOW_STUB = `
interface OkapiCloud {
  ready: boolean;
  projectId: string;
  list(collection: string): Promise<any[]>;
  create(collection: string, data?: Record<string, unknown>): Promise<any>;
  update(recordId: string, data?: Record<string, unknown>): Promise<any>;
  remove(recordId: string): Promise<boolean>;
}
interface Window {
  Okapi?: OkapiCloud;
}
declare const Okapi: OkapiCloud | undefined;
export {};
`.trim();

export const OKAPI_MONACO_THEME = "okapi-forest";

const MONACO_FONT =
  '"Cascadia Code", "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Options lecture seule (diff Original / Proposé). */
export function monacoReviewOptions(readOnly: boolean) {
  return {
    readOnly,
    fontSize: 13,
    fontFamily: MONACO_FONT,
    fontLigatures: true,
    lineHeight: 20,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: "on" as const,
    tabSize: 2,
    padding: { top: 10, bottom: 10 },
    renderLineHighlight: "none" as const,
    lineNumbers: "on" as const,
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
      useShadows: false,
    },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    renderWhitespace: "none" as const,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    smoothScrolling: true,
  };
}

/** Options éditeur principal Studio. */
export function monacoEditorOptions(readOnly: boolean) {
  return {
    ...monacoReviewOptions(readOnly),
    fontSize: 13.5,
    lineHeight: 22,
    letterSpacing: 0.2,
    padding: { top: 14, bottom: 18 },
    renderLineHighlight: "all" as const,
    renderLineHighlightOnlyWhenFocus: false,
    cursorBlinking: "smooth" as const,
    cursorSmoothCaretAnimation: "on" as const,
    cursorWidth: 2,
    roundedSelection: true,
    smoothScrolling: true,
    mouseWheelZoom: true,
    formatOnPaste: true,
    formatOnType: true,
    autoClosingBrackets: "languageDefined" as const,
    autoClosingQuotes: "languageDefined" as const,
    autoIndent: "full" as const,
    matchBrackets: "always" as const,
    linkedEditing: true,
    stickyScroll: { enabled: true },
    folding: true,
    foldingHighlight: true,
    showFoldingControls: "mouseover" as const,
    glyphMargin: true,
    renderWhitespace: "selection" as const,
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: "active" as const,
      indentation: true,
      highlightActiveIndentation: true,
    },
    suggest: {
      preview: true,
      showKeywords: true,
      showSnippets: true,
    },
    quickSuggestions: {
      other: true,
      comments: false,
      strings: true,
    },
    parameterHints: { enabled: true },
    hover: { enabled: true, delay: 280 },
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
      useShadows: true,
    },
    overviewRulerLanes: 2,
    hideCursorInOverviewRuler: false,
    accessibilitySupport: "auto" as const,
  };
}

function defineOkapiForestTheme(monaco: any) {
  if (!monaco?.editor?.defineTheme) return;
  monaco.editor.defineTheme(OKAPI_MONACO_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "d8e8df", background: "0b1511" },
      { token: "comment", foreground: "6b8578", fontStyle: "italic" },
      { token: "string", foreground: "e8b86d" },
      { token: "number", foreground: "9fd4b5" },
      { token: "keyword", foreground: "e8892a" },
      { token: "type", foreground: "7ec8a3" },
      { token: "class", foreground: "9fd4b5" },
      { token: "function", foreground: "c8ddd2" },
      { token: "variable", foreground: "d8e8df" },
      { token: "constant", foreground: "ffd7a8" },
      { token: "tag", foreground: "e8892a" },
      { token: "attribute.name", foreground: "9fd4b5" },
      { token: "attribute.value", foreground: "e8b86d" },
      { token: "delimiter", foreground: "8aa89a" },
      { token: "delimiter.html", foreground: "8aa89a" },
      { token: "metatag", foreground: "e8892a" },
      { token: "metatag.content.html", foreground: "d8e8df" },
    ],
    colors: {
      "editor.background": "#0b1511",
      "editor.foreground": "#d8e8df",
      "editor.lineHighlightBackground": "#12201a88",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#1b4f3a66",
      "editor.inactiveSelectionBackground": "#1b4f3a33",
      "editorCursor.foreground": "#e8892a",
      "editorWhitespace.foreground": "#2a3d34",
      "editorIndentGuide.background": "#1a2a22",
      "editorIndentGuide.activeBackground": "#3d8f68",
      "editorLineNumber.foreground": "#5a7266",
      "editorLineNumber.activeForeground": "#9fd4b5",
      "editorGutter.background": "#0b1511",
      "editorWidget.background": "#101c17",
      "editorWidget.border": "#e8892a33",
      "editorSuggestWidget.background": "#101c17",
      "editorSuggestWidget.border": "#e8892a33",
      "editorSuggestWidget.selectedBackground": "#1b4f3a88",
      "editorHoverWidget.background": "#101c17",
      "editorHoverWidget.border": "#e8892a33",
      "editorBracketMatch.background": "#e8892a22",
      "editorBracketMatch.border": "#e8892a88",
      "scrollbarSlider.background": "#3d8f6844",
      "scrollbarSlider.hoverBackground": "#3d8f6888",
      "scrollbarSlider.activeBackground": "#e8892a66",
      "minimap.background": "#0b1511",
      "editor.findMatchBackground": "#e8892a44",
      "editor.findMatchHighlightBackground": "#3d8f6844",
      "editor.wordHighlightBackground": "#1b4f3a55",
      "editor.wordHighlightStrongBackground": "#e8892a33",
      "editorStickyScroll.background": "#0e1a15",
      "editorStickyScrollHover.background": "#15241d",
      "editorStickyScroll.shadow": "#00000066",
      "peekViewEditor.background": "#0e1a15",
      "peekViewResult.background": "#101c17",
      "peekViewTitle.background": "#12201a",
      "diffEditor.insertedTextBackground": "#3d8f6833",
      "diffEditor.removedTextBackground": "#e8892a22",
      focusBorder: "#e8892a55",
    },
  });
}

let configured = false;

/**
 * One-shot: thème Okapi + TS worker + React stubs + JSON validate.
 * monaco is the runtime object from @monaco-editor/react (typed loosely —
 * monaco-editor package types vary by version).
 */
export function configureMonacoStudio(monaco: any) {
  if (!monaco) return;
  defineOkapiForestTheme(monaco);
  if (configured || !monaco?.languages?.typescript) {
    // Thème peut être re-appliqué même si déjà configuré
    try {
      monaco.editor?.setTheme?.(OKAPI_MONACO_THEME);
    } catch {
      /* ignore */
    }
    return;
  }
  configured = true;

  const ts = monaco.languages.typescript;

  const compilerOptions = {
    target: ts.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.React,
    reactNamespace: "React",
    allowSyntheticDefaultImports: true,
    strict: false,
    noImplicitAny: false,
    skipLibCheck: true,
  };

  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);

  // 2307 = Cannot find module — no node_modules in Studio
  const ignore = [2307, 2792];
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: ignore,
  });
  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: ignore,
  });

  ts.typescriptDefaults.addExtraLib(
    REACT_STUB,
    "file:///okapi-stubs/react.d.ts",
  );
  ts.typescriptDefaults.addExtraLib(
    OKAPI_WINDOW_STUB,
    "file:///okapi-stubs/okapi-window.d.ts",
  );
  ts.javascriptDefaults.addExtraLib(
    REACT_STUB,
    "file:///okapi-stubs/react.d.ts",
  );
  ts.javascriptDefaults.addExtraLib(
    OKAPI_WINDOW_STUB,
    "file:///okapi-stubs/okapi-window.d.ts",
  );

  monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions?.({
    validate: true,
    allowComments: true,
    schemas: [],
    enableSchemaRequest: false,
  });

  try {
    monaco.editor.setTheme(OKAPI_MONACO_THEME);
  } catch {
    /* ignore */
  }
}

function severityFromMonaco(sev: number): StudioProblemSeverity {
  // MarkerSeverity: Hint=1 Info=2 Warning=4 Error=8
  if (sev >= 8) return "error";
  if (sev >= 4) return "warning";
  return "info";
}

export function monacoMarkersToProblems(
  fileId: StudioFileId,
  markers: {
    severity: number;
    message: string;
    startLineNumber: number;
    code?: string | { value: string };
  }[],
): StudioProblem[] {
  return markers
    .filter((m) => m.severity >= 2)
    .slice(0, 40)
    .map((m, i) => {
      const code =
        typeof m.code === "string"
          ? m.code
          : m.code && typeof m.code === "object"
            ? m.code.value
            : "";
      return {
        id: `monaco-${fileId}-${m.startLineNumber}-${code || i}`,
        severity: severityFromMonaco(m.severity),
        fileId,
        message: m.message,
        line: m.startLineNumber,
      };
    });
}

export function studioFilePath(fileId: StudioFileId): string {
  return `file:///okapi-studio/${fileId}`;
}
