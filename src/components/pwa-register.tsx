"use client";

import { useEffect } from "react";

/** Registers the Okapi service worker (production only). */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // En dev, le SW casse souvent le hot-reload / router Next
    if (process.env.NODE_ENV !== "production") return;

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore SW errors in unsupported contexts */
    });
  }, []);

  return null;
}
