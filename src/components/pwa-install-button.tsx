"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (standalone) {
      setInstalled(true);
      return;
    }

    function onBip(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  if (installed) {
    return (
      <p className="text-sm text-okapi-forest">
        Okapi est installé sur cet appareil.
      </p>
    );
  }

  if (!deferred) {
    return (
      <p className="text-sm text-okapi-ink/50">
        Sur mobile : menu du navigateur →{" "}
        <span className="font-medium text-okapi-ink/70">
          Ajouter à l’écran d’accueil
        </span>
        . Sur Chrome desktop, l’icône d’installation apparaît dans la barre
        d’adresse.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void install()}
      className="rounded-2xl bg-okapi-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-okapi-leaf"
    >
      Installer Okapi (PWA)
    </button>
  );
}
