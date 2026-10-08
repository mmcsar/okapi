"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  OKAPI_MSG_SOURCE_HOST,
  isOkapiPreviewApiRequest,
  type OkapiPreviewApiRequest,
  type OkapiPreviewApiResponse,
} from "@/lib/okapi-runtime";

/**
 * Bridge Preview pour pages publiques /p/[slug] — sans JWT.
 * Les appels window.Okapi passent par /api/public/[slug]/records.
 */
export function useOkapiPublicBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  slug: string | null | undefined,
) {
  const slugRef = useRef(slug);
  slugRef.current = slug;

  useEffect(() => {
    async function handle(ev: MessageEvent) {
      if (!isOkapiPreviewApiRequest(ev.data)) return;

      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      if (ev.source !== iframe.contentWindow) return;

      const req = ev.data as OkapiPreviewApiRequest;
      const s = slugRef.current?.trim();

      const reply = (payload: Omit<OkapiPreviewApiResponse, "source" | "type">) => {
        const msg: OkapiPreviewApiResponse = {
          source: OKAPI_MSG_SOURCE_HOST,
          type: "okapi:api:result",
          ...payload,
        };
        iframe.contentWindow?.postMessage(msg, "*");
      };

      try {
        if (!s) {
          reply({
            id: req.id,
            ok: false,
            error: "Lien de partage invalide.",
          });
          return;
        }

        let result: unknown;

        if (req.op === "list") {
          const q = req.collection
            ? `?collection=${encodeURIComponent(req.collection)}`
            : "";
          const res = await fetch(`/api/public/${encodeURIComponent(s)}/records${q}`);
          const data = (await res.json().catch(() => null)) as {
            records?: unknown;
            error?: string;
          } | null;
          if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
          result = data?.records ?? [];
        } else if (req.op === "create") {
          if (!req.collection) throw new Error("collection manquante");
          const res = await fetch(`/api/public/${encodeURIComponent(s)}/records`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
        } else if (req.op === "update" || req.op === "remove") {
          throw new Error(
            "Lien public : lecture et ajout seulement. Modification réservée au propriétaire.",
          );
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
