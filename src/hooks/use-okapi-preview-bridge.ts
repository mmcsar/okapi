"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  OKAPI_MSG_SOURCE_HOST,
  isOkapiPreviewApiRequest,
  type OkapiPreviewApiRequest,
  type OkapiPreviewApiResponse,
} from "@/lib/okapi-runtime";

/**
 * Écoute les appels window.Okapi depuis l’iframe Preview (sandbox sans same-origin)
 * et exécute les fetch authentifiés côté parent — le JWT ne quitte jamais le host.
 */
export function useOkapiPreviewBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  projectId: string | null | undefined,
) {
  const { authFetch, accessToken } = useAuth();
  const projectIdRef = useRef(projectId);
  const authFetchRef = useRef(authFetch);
  const tokenRef = useRef(accessToken);
  projectIdRef.current = projectId;
  authFetchRef.current = authFetch;
  tokenRef.current = accessToken;

  useEffect(() => {
    async function handle(ev: MessageEvent) {
      if (!isOkapiPreviewApiRequest(ev.data)) return;

      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      // Accepte uniquement les messages de NOTRE iframe preview
      if (ev.source !== iframe.contentWindow) return;

      const req = ev.data as OkapiPreviewApiRequest;
      const pid = projectIdRef.current;

      const reply = (payload: Omit<OkapiPreviewApiResponse, "source" | "type">) => {
        const msg: OkapiPreviewApiResponse = {
          source: OKAPI_MSG_SOURCE_HOST,
          type: "okapi:api:result",
          ...payload,
        };
        // origin opaque (sandbox sans same-origin) → '*'
        iframe.contentWindow?.postMessage(msg, "*");
      };

      try {
        if (!pid) {
          reply({
            id: req.id,
            ok: false,
            error:
              "Okapi: projet non sauvegardé. Connecte-toi et enregistre le projet.",
          });
          return;
        }
        if (!tokenRef.current) {
          reply({
            id: req.id,
            ok: false,
            error: "Okapi: connexion requise.",
          });
          return;
        }

        let result: unknown;

        if (req.op === "list") {
          const q = req.collection
            ? `?collection=${encodeURIComponent(req.collection)}`
            : "";
          const res = await authFetchRef.current(
            `/api/apps/${pid}/records${q}`,
          );
          const data = (await res.json().catch(() => null)) as {
            records?: unknown;
            error?: string;
          } | null;
          if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
          result = data?.records ?? [];
        } else if (req.op === "create") {
          if (!req.collection) throw new Error("collection manquante");
          const res = await authFetchRef.current(`/api/apps/${pid}/records`, {
            method: "POST",
            body: JSON.stringify({
              collection: req.collection,
              data: req.data || {},
            }),
          });
          const data = (await res.json().catch(() => null)) as {
            record?: unknown;
            error?: string;
          } | null;
          if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
          result = data?.record;
        } else if (req.op === "update") {
          if (!req.recordId) throw new Error("recordId manquant");
          const res = await authFetchRef.current(
            `/api/apps/${pid}/records/${req.recordId}`,
            {
              method: "PATCH",
              body: JSON.stringify({ data: req.data || {} }),
            },
          );
          const data = (await res.json().catch(() => null)) as {
            record?: unknown;
            error?: string;
          } | null;
          if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
          result = data?.record;
        } else if (req.op === "remove") {
          if (!req.recordId) throw new Error("recordId manquant");
          const res = await authFetchRef.current(
            `/api/apps/${pid}/records/${req.recordId}`,
            { method: "DELETE" },
          );
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
          result = true;
        }

        reply({ id: req.id, ok: true, result });
      } catch (err) {
        reply({
          id: req.id,
          ok: false,
          error: err instanceof Error ? err.message : "Erreur Okapi",
        });
      }
    }

    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [iframeRef]);
}
