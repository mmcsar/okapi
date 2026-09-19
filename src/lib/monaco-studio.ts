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

let configured = false;

/**
 * One-shot: TS worker options + React stubs + JSON validate.
 * monaco is the runtime object from @monaco-editor/react (typed loosely —
 * monaco-editor package types vary by version).
 */
export function configureMonacoStudio(monaco: any) {
  if (configured || !monaco?.languages?.typescript) return;
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

  monaco.languages.json?.jsonDefaults?.setDiagnosticsOptions?.({
    validate: true,
    allowComments: false,
    schemas: [],
    enableSchemaRequest: false,
  });
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
