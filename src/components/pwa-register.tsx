"use client";

import { useEffect } from "react";

/** Registers the Okapi service worker (production only). */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // En dev: désactiver tout SW (casse souvent navigation / hot-reload)
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore SW errors in unsupported contexts */
    });
  }, []);

  return null;
}
