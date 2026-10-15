"use client";

import { usePwaInstall } from "@/hooks/use-pwa-install";

export function PwaInstallButton() {
  const { installed, canPrompt, iosHint, install } = usePwaInstall();

  if (installed) {
    return (
      <p className="text-sm text-okapi-forest">
        Okapi est installé sur cet appareil.
      </p>
    );
  }

  if (!canPrompt) {
    return (
      <p className="text-sm text-okapi-ink/50">
        {iosHint ? (
          <>
            Sur Safari : bouton{" "}
            <span className="font-medium text-okapi-ink/70">Partager</span> →{" "}
            <span className="font-medium text-okapi-ink/70">
              Sur l’écran d’accueil
            </span>
            .
          </>
        ) : (
          <>
            Sur mobile : menu du navigateur →{" "}
            <span className="font-medium text-okapi-ink/70">
              Ajouter à l’écran d’accueil
            </span>
            . Sur Chrome desktop, l’icône d’installation apparaît dans la barre
            d’adresse.
          </>
        )}
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
