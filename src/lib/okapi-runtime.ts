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
 * Sans projectId : mémoire locale Preview (tableaux utilisables tout de suite).
 * list/create renvoient des lignes plates { id, ...champs } (pas { data: {...} }).
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
  var mem = {};

  function flatRow(rec) {
    if (!rec || typeof rec !== "object") return rec;
    if (rec.data && typeof rec.data === "object" && !Array.isArray(rec.data)) {
      var out = {};
      for (var k in rec.data) {
        if (Object.prototype.hasOwnProperty.call(rec.data, k)) out[k] = rec.data[k];
      }
      out.id = rec.id;
      if (rec.created_at) out.created_at = rec.created_at;
      if (rec.updated_at) out.updated_at = rec.updated_at;
      return out;
    }
    return rec;
  }

  function memList(collection) {
    return (mem[collection] || []).slice();
  }

  function memCreate(collection, row) {
    if (!mem[collection]) mem[collection] = [];
    var id = "local_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
    var item = Object.assign({}, row || {}, { id: id });
    mem[collection].unshift(item);
    return item;
  }

  function memUpdate(recordId, row) {
    for (var col in mem) {
      var arr = mem[col] || [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === recordId) {
          arr[i] = Object.assign({}, arr[i], row || {}, { id: recordId });
          return arr[i];
        }
      }
    }
    throw new Error("Okapi: enregistrement introuvable.");
  }

  function memRemove(recordId) {
    for (var col in mem) {
      mem[col] = (mem[col] || []).filter(function(r){ return r.id !== recordId; });
    }
  }

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
    ready: true,
    cloud: Boolean(PROJECT_ID),
    secureBridge: true,
    async list(collection) {
      var key = String(collection || "items");
      if (!PROJECT_ID) return memList(key);
      var records = await callParent("list", { collection: key });
      return (records || []).map(flatRow);
    },
    async create(collection, row) {
      var key = String(collection || "items");
      if (!PROJECT_ID) return memCreate(key, row || {});
      var rec = await callParent("create", { collection: key, data: row || {} });
      return flatRow(rec);
    },
    async update(recordId, row) {
      if (!PROJECT_ID) return memUpdate(recordId, row || {});
      var rec = await callParent("update", { recordId: recordId, data: row || {} });
      return flatRow(rec);
    },
    async remove(recordId) {
      if (!PROJECT_ID) {
        memRemove(recordId);
        return true;
      }
      await callParent("remove", { recordId: recordId });
      return true;
    }
  };
  try {
    window.dispatchEvent(new CustomEvent("okapi:ready", {
      detail: { ready: true, cloud: Boolean(PROJECT_ID), secureBridge: true }
    }));
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

/** Indicateur chrome Studio : window.Okapi live ou pas. */
export type OkapiCloudStatus = {
  ready: boolean;
  label: string;
  hint: string;
  tone: "ok" | "warn" | "off";
};

export function resolveOkapiCloudStatus(opts: {
  projectId?: string | null;
  accessToken?: string | null;
}): OkapiCloudStatus {
  if (!opts.accessToken) {
    return {
      ready: true,
      label: "Mémoire locale",
      hint: "Preview OK sans compte. Connecte-toi + Sauver pour persister dans le cloud.",
      tone: "warn",
    };
  }
  if (!opts.projectId) {
    return {
      ready: true,
      label: "À sauver",
      hint: "Tableaux Preview actifs en local. Ctrl+S pour brancher le cloud.",
      tone: "warn",
    };
  }
  return {
    ready: true,
    label: "Cloud prêt",
    hint: "Preview branchée sur la base Okapi (app_records).",
    tone: "ok",
  };
}

/** Honnêteté stacks : Preview = HTML ; autres = export ZIP. */
export function studioStackHints(snap: {
  nextjs?: string | null;
  packageJson?: string | null;
  flutter?: string | null;
  pubspec?: string | null;
  python?: string | null;
  requirements?: string | null;
}): string[] {
  const out = ["Preview · HTML"];
  if (snap.nextjs?.trim() || snap.packageJson?.trim()) {
    out.push("Next → ZIP");
  }
  if (snap.flutter?.trim() || snap.pubspec?.trim()) {
    out.push("Flutter → ZIP");
  }
  if (snap.python?.trim() || snap.requirements?.trim()) {
    out.push("Python → ZIP");
  }
  return out;
}
