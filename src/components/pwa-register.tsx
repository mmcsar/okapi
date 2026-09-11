"use client";

import { useEffect } from "react";

/** Registers the Okapi service worker (production + HTTPS / localhost). */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (process.env.NODE_ENV !== "production" && !isLocal) return;

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore SW errors in unsupported contexts */
    });
  }, []);

  return null;
}
