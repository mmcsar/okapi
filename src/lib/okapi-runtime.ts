/** Preview sécurisée : runtime sans JWT — bridge postMessage vers le parent Okapi. */

export const OKAPI_RUNTIME_MARKER = "data-okapi-runtime";

/** Iframe owner Preview — PAS allow-same-origin (bloque vol localStorage/session). */
export const OKAPI_PREVIEW_SANDBOX = "allow-scripts allow-forms";

/** Partage public : scripts OK pour l’app, jamais same-origin. */
export const OKAPI_PUBLIC_SANDBOX = "allow-scripts allow-forms";

export const OKAPI_MSG_SOURCE_PREVIEW = "okapi-preview";
export const OKAPI_MSG_SOURCE_HOST = "okapi-host";

export type OkapiPreviewApiOp = "list" | "create" | "update" | "remove";

export type OkapiPreviewApiRequest = {
  source: typeof OKAPI_MSG_SOURCE_PREVIEW;
  type: "okapi:api";
  id: string;
  op: OkapiPreviewApiOp;
  collection?: string;
  recordId?: string;
  data?: Record<string, unknown>;
};

export type OkapiPreviewApiResponse = {
  source: typeof OKAPI_MSG_SOURCE_HOST;
  type: "okapi:api:result";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

/** Retire scripts runtime / tokens accidentels avant save ou partage public. */
export function stripOkapiRuntime(html: string): string {
  if (!html) return html;
  let out = html.replace(
    /<script[^>]*data-okapi-runtime="1"[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  // Filet : ancien runtime avec TOKEN en clair
  out = out.replace(
    /var\s+TOKEN\s*=\s*["'][^"']*["']\s*;?/g,
    'var TOKEN="";',
  );
  out = out.replace(
    /Authorization["']?\s*:\s*["']Bearer\s+[^"']+["']/gi,
    'Authorization:""',
  );
  return out;
}

/**
 * Runtime injecté dans srcDoc — AUCUN JWT.
 * Les appels data passent par postMessage → parent (authFetch).
 */
export function buildOkapiRuntimeScript(opts: {
  projectId: string | null;
  parentOrigin: string;
}): string {
  const projectId = opts.projectId || "";
  const parentOrigin = opts.parentOrigin || "";

  return `<script ${OKAPI_RUNTIME_MARKER}="1">
(function(){
  var PROJECT_ID = ${JSON.stringify(projectId)};
  var PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};
  var pending = {};

  function callParent(op, payload) {
    return new Promise(function(resolve, reject) {
      if (!PROJECT_ID) {
        reject(new Error("Okapi: connecte-toi et sauvegarde le projet pour les données réelles."));
        return;
      }
      if (!window.parent || window.parent === window) {
        reject(new Error("Okapi: Preview hors hôte sécurisé."));
        return;
      }
      var id = "okapi_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      pending[id] = { resolve: resolve, reject: reject };
      var msg = {
        source: ${JSON.stringify(OKAPI_MSG_SOURCE_PREVIEW)},
        type: "okapi:api",
        id: id,
        op: op,
        collection: payload && payload.collection,
        recordId: payload && payload.recordId,
        data: payload && payload.data
      };
      try {
        window.parent.postMessage(msg, PARENT_ORIGIN || "*");
      } catch (e) {
        delete pending[id];
        reject(e);
      }
      setTimeout(function(){
        if (pending[id]) {
          pending[id].reject(new Error("Okapi: délai dépassé."));
          delete pending[id];
        }
      }, 30000);
    });
  }

  window.addEventListener("message", function(ev) {
    var data = ev.data;
    if (!data || data.source !== ${JSON.stringify(OKAPI_MSG_SOURCE_HOST)} || data.type !== "okapi:api:result") return;
    if (PARENT_ORIGIN && ev.origin !== PARENT_ORIGIN && ev.origin !== "null") return;
    var slot = pending[data.id];
    if (!slot) return;
    delete pending[data.id];
    if (data.ok) slot.resolve(data.result);
    else slot.reject(new Error(data.error || "Erreur Okapi"));
  });

  window.Okapi = {
    projectId: PROJECT_ID,
    ready: Boolean(PROJECT_ID),
    secureBridge: true,
    async list(collection) {
      var records = await callParent("list", { collection: collection });
      return records || [];
    },
    async create(collection, row) {
      return callParent("create", { collection: collection, data: row || {} });
    },
    async update(recordId, row) {
      return callParent("update", { recordId: recordId, data: row || {} });
    },
    async remove(recordId) {
      await callParent("remove", { recordId: recordId });
      return true;
    }
  };
  try {
    window.dispatchEvent(new CustomEvent("okapi:ready", { detail: { ready: window.Okapi.ready, secureBridge: true } }));
  } catch (e) {}
})();
</script>`;
}

export function injectOkapiRuntime(
  html: string,
  opts: {
    projectId: string | null;
    parentOrigin?: string;
    /** @deprecated ignored — never inject tokens */
    accessToken?: string | null;
    origin?: string;
  },
): string {
  if (!html?.trim()) return html;
  const cleaned = stripOkapiRuntime(html);
  const parentOrigin = opts.parentOrigin || opts.origin || "";
  const script = buildOkapiRuntimeScript({
    projectId: opts.projectId,
    parentOrigin,
  });
  if (/<\/head>/i.test(cleaned)) {
    return cleaned.replace(/<\/head>/i, `${script}\n</head>`);
  }
  if (/<body[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<body([^>]*)>/i, `<body$1>\n${script}`);
  }
  return `${script}\n${cleaned}`;
}

export function isOkapiPreviewApiRequest(
  data: unknown,
): data is OkapiPreviewApiRequest {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.source === OKAPI_MSG_SOURCE_PREVIEW &&
    d.type === "okapi:api" &&
    typeof d.id === "string" &&
    (d.op === "list" ||
      d.op === "create" ||
      d.op === "update" ||
      d.op === "remove")
  );
}
