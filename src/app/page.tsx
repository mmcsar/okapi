"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { BillingPanel } from "@/components/billing-panel";
import { HomeDashboard } from "@/components/home-dashboard";
import { LoginPanel } from "@/components/login-panel";
import { ProjectsPanel } from "@/components/projects-panel";
import { ScheduledTasksPanel } from "@/components/scheduled-tasks-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { Sidebar } from "@/components/sidebar";
import type { OkapiProject } from "@/lib/supabase";

type NavId =
  | "home"
  | "studio"
  | "projects"
  | "automations"
  | "settings"
  | "login"
  | "billing";

function parseHash(): NavId {
  if (typeof window === "undefined") return "home";
  const raw = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  if (raw === "studio" || raw === "dev") return "studio";
  if (raw === "projects" || raw === "projets") return "projects";
  if (
    raw === "automations" ||
    raw === "automatisations" ||
    raw === "tasks" ||
    raw === "taches" ||
    raw === "tâches"
  ) {
    return "automations";
  }
  if (raw === "settings" || raw === "parametres" || raw === "paramètres")
    return "settings";
  if (raw === "billing" || raw === "abonnement" || raw === "pay")
    return "billing";
  if (raw === "login" || raw === "connexion") return "login";
  return "home";
}

function hashFor(id: NavId) {
  if (id === "studio") return "#studio";
  if (id === "projects") return "#projects";
  if (id === "automations") return "#automations";
  if (id === "settings") return "#settings";
  if (id === "billing") return "#billing";
  if (id === "login") return "#login";
  return "#home";
}

function HomeApp() {
  const { user, displayName, signOut, ready } = useAuth();
  const [activeNav, setActiveNav] = useState<NavId>("home");
  const [resetKey, setResetKey] = useState(0);
  const [studioKick, setStudioKick] = useState(0);
  const [openProject, setOpenProject] = useState<OkapiProject | null>(null);
  const [openInStudio, setOpenInStudio] = useState(false);

  useEffect(() => {
    const apply = () => setActiveNav(parseHash());
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const setNav = useCallback((id: NavId) => {
    setActiveNav(id);
    const next = hashFor(id);
    if (window.location.hash !== next) {
      window.location.hash = next;
    }
  }, []);

  const navigate = useCallback(
    (id: string) => {
      if (id === "auth-login" || id === "login") {
        setNav("login");
        return;
      }
      if (id === "logout") {
        void signOut();
        setNav("login");
        return;
      }
      if (
        id === "dashboard" ||
        id === "build" ||
        id === "home" ||
        id === "agents" ||
        id === "website"
      ) {
        // Garder le projet ouvert — sinon Studio → Agent efface la Preview
        setOpenInStudio(false);
        setNav("home");
        return;
      }
      if (id === "studio" || id === "dev") {
        setOpenInStudio(true);
        setStudioKick((k) => k + 1);
        setNav("studio");
        return;
      }
      if (id === "projects") {
        setNav("projects");
        return;
      }
      if (
        id === "automations" ||
        id === "automatisations" ||
        id === "tasks" ||
        id === "taches"
      ) {
        setNav("automations");
        return;
      }
      if (id === "settings") {
        setNav("settings");
        return;
      }
      if (id === "billing" || id === "abonnement") {
        setNav("billing");
        return;
      }
      setNav("home");
    },
    [setNav, signOut],
  );

  const startNewProject = useCallback(() => {
    setOpenProject(null);
    setOpenInStudio(false);
    setResetKey((k) => k + 1);
    setNav("home");
  }, [setNav]);

  const handleOpenProject = useCallback(
    (project: OkapiProject) => {
      setOpenProject(project);
      setOpenInStudio(true);
      setResetKey((k) => k + 1);
      setNav("studio");
    },
    [setNav],
  );

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-okapi-ink/55">Chargement Okapi…</p>
      </div>
    );
  }

  const sidebarActive =
    activeNav === "projects" ||
    activeNav === "automations" ||
    activeNav === "settings" ||
    activeNav === "billing" ||
    activeNav === "studio"
      ? activeNav
      : "home";

  const showAgentWorkspace =
    activeNav === "home" || activeNav === "studio";
  const studioLayout = activeNav === "studio";

  return (
    <div
      className={`relative z-10 flex min-h-screen w-full flex-col md:flex-row ${
        studioLayout
          ? "h-dvh max-h-dvh gap-0 overflow-hidden p-0"
          : "gap-3 p-3 md:gap-2 md:p-4"
      }`}
    >
      <Sidebar
        activeNav={sidebarActive}
        onNavChange={navigate}
        onNewProject={startNewProject}
        userLabel={user ? displayName : "Invité"}
        loggedIn={Boolean(user)}
        compact={studioLayout}
      />

      <div
        className={`relative z-0 flex min-h-0 min-w-0 flex-1 flex-col ${
          studioLayout ? "gap-0 pt-12 md:pt-0" : "gap-2 pt-12 md:pt-0"
        }`}
      >
        {!studioLayout ? (
        <div className="flex flex-wrap items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={startNewProject}
            className="rounded-xl bg-okapi-amber px-3 py-2 text-xs font-semibold text-white"
          >
            + Nouveau
          </button>
          <button
            type="button"
            onClick={() => navigate("home")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${
              activeNav === "home"
                ? "bg-okapi-forest text-white"
                : "border border-[var(--okapi-stroke)] bg-white/80 text-okapi-ink/70"
            }`}
          >
            Agent
          </button>
          <button
            type="button"
            onClick={() => navigate("studio")}
            className="rounded-xl border border-[var(--okapi-stroke)] bg-white/80 px-3 py-2 text-xs font-semibold text-okapi-ink/70"
          >
            Studio
          </button>
          <button
            type="button"
            onClick={() => navigate("projects")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${
              activeNav === "projects"
                ? "bg-okapi-forest text-white"
                : "border border-[var(--okapi-stroke)] bg-white/80 text-okapi-ink/70"
            }`}
          >
            Projets
          </button>
          <button
            type="button"
            onClick={() => navigate("automations")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${
              activeNav === "automations"
                ? "bg-okapi-forest text-white"
                : "border border-[var(--okapi-stroke)] bg-white/80 text-okapi-ink/70"
            }`}
          >
            Auto
          </button>
        </div>
        ) : null}

        {activeNav === "settings" ? (
          <SettingsPanel
            onBack={() => navigate("home")}
            onOpenBilling={() => navigate("billing")}
          />
        ) : activeNav === "billing" ? (
          <BillingPanel
            onBack={() => navigate("home")}
            onNeedLogin={() => navigate("login")}
          />
        ) : activeNav === "login" ? (
          <LoginPanel
            onBack={() => navigate("home")}
            onSuccess={() => navigate("home")}
          />
        ) : activeNav === "automations" ? (
          <ScheduledTasksPanel
            onBack={() => navigate("home")}
            onNeedLogin={() => navigate("login")}
          />
        ) : activeNav === "projects" ? (
          <ProjectsPanel
            onBack={() => navigate("home")}
            onOpenProject={handleOpenProject}
            onCreateNew={startNewProject}
            onNeedLogin={() => navigate("login")}
          />
        ) : showAgentWorkspace ? (
          <HomeDashboard
            section="dashboard"
            resetKey={resetKey}
            studioKick={studioKick}
            initialProject={openProject}
            openInStudio={openInStudio || activeNav === "studio"}
            onGoHome={() => navigate("home")}
            onNavigate={navigate}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <HomeApp />
    </AuthProvider>
  );
}
