"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { usePwaInstall } from "@/hooks/use-pwa-install";

const DISMISS_KEY = "okapi-pwa-banner-dismissed";
const DISMISS_DAYS = 21;
const SHOW_DELAY_MS = 2800;

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Bannière discrète « Installer Okapi » — après connexion uniquement,
 * pas sur Studio plein écran ni si déjà installé / déjà refusé.
 */
export function PwaInstallBanner({
  hidden = false,
}: {
  /** Masquer (ex. Studio layout). */
  hidden?: boolean;
}) {
  const { user } = useAuth();
  const { installed, canPrompt, iosHint, install } = usePwaInstall();
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || installed || hidden || wasDismissedRecently()) {
      setVisible(false);
      setReady(false);
      return;
    }
    const t = window.setTimeout(() => {
      setReady(true);
      setVisible(true);
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [user, installed, hidden]);

  if (!user || installed || hidden || !ready || !visible) return null;

  // Chrome/Edge : bouton natif. iOS / autres : aide courte.
  const showInstall = canPrompt;

  function dismiss() {
    rememberDismiss();
    setVisible(false);
  }

  async function onInstall() {
    const ok = await install();
    if (ok) {
      rememberDismiss();
      setVisible(false);
    }
  }

  return (
    <div
      className="okapi-pwa-banner pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:bottom-3 md:justify-end md:p-4"
      role="dialog"
      aria-label="Installer Okapi"
    >
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-[var(--okapi-stroke)] bg-white/95 px-3.5 py-2.5 shadow-[0_12px_40px_-12px_rgba(20,38,28,0.35)] backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-syne)] text-sm font-bold text-okapi-ink">
            Installer Okapi
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-okapi-ink/55">
            {showInstall
              ? "Sur ton téléphone ou bureau — ouverture rapide, sans store."
              : iosHint
                ? "Safari → Partager → Sur l’écran d’accueil."
                : "Menu navigateur → Ajouter à l’écran d’accueil."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {showInstall ? (
            <button
              type="button"
              onClick={() => void onInstall()}
              className="rounded-xl bg-okapi-forest px-3 py-2 text-xs font-semibold text-white hover:bg-okapi-leaf"
            >
              Installer
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl px-2.5 py-2 text-xs font-medium text-okapi-ink/45 hover:bg-okapi-mist hover:text-okapi-ink/70"
            aria-label="Fermer"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
