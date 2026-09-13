"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { HomeDashboard } from "@/components/home-dashboard";
import { LoginPanel } from "@/components/login-panel";
import { ProjectsPanel } from "@/components/projects-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { Sidebar } from "@/components/sidebar";
import type { OkapiProject } from "@/lib/supabase";

type NavId = "home" | "projects" | "settings" | "login";

function parseHash(): NavId {
  if (typeof window === "undefined") return "home";
  const raw = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  if (raw === "projects" || raw === "projets") return "projects";
  if (raw === "settings" || raw === "parametres" || raw === "paramètres")
    return "settings";
  if (raw === "login" || raw === "connexion") return "login";
  return "home";
}

function HomeApp() {
  const { user, displayName, signOut, ready } = useAuth();
  const [activeNav, setActiveNav] = useState<NavId>("home");
  const [resetKey, setResetKey] = useState(0);
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
    const next =
      id === "home" ? "#home" : id === "projects" ? "#projects" : id === "settings" ? "#settings" : "#login";
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
        setOpenProject(null);
        setOpenInStudio(false);
        setNav("home");
        return;
      }
      if (id === "projects") {
        setNav("projects");
        return;
      }
      if (id === "settings") {
        setNav("settings");
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
      setNav("home");
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
    activeNav === "projects" || activeNav === "settings" ? activeNav : "home";

  return (
    <div className="relative z-10 flex min-h-screen w-full flex-col gap-3 p-3 md:flex-row md:gap-2 md:p-4">
      <Sidebar
        activeNav={sidebarActive}
        onNavChange={navigate}
        onNewProject={startNewProject}
        userLabel={user ? displayName : "Invité"}
        loggedIn={Boolean(user)}
      />

      <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col gap-2 pt-12 md:pt-0">
        {/* Barre de secours — toujours cliquable même si le tiroir latéral pose problème */}
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
            onClick={() => navigate("settings")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${
              activeNav === "settings"
                ? "bg-okapi-forest text-white"
                : "border border-[var(--okapi-stroke)] bg-white/80 text-okapi-ink/70"
            }`}
          >
            Paramètres
          </button>
        </div>

        {activeNav === "settings" ? (
          <SettingsPanel onBack={() => navigate("home")} />
        ) : activeNav === "login" ? (
          <LoginPanel
            onBack={() => navigate("home")}
            onSuccess={() => navigate("home")}
          />
        ) : activeNav === "projects" ? (
          <ProjectsPanel
            onBack={() => navigate("home")}
            onOpenProject={handleOpenProject}
            onCreateNew={startNewProject}
            onNeedLogin={() => navigate("login")}
          />
        ) : (
          <HomeDashboard
            section="dashboard"
            resetKey={resetKey}
            initialProject={openProject}
            openInStudio={openInStudio}
            onGoHome={() => navigate("home")}
            onNavigate={navigate}
          />
        )}
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
