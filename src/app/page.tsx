"use client";

import { useCallback, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { HomeDashboard } from "@/components/home-dashboard";
import { LoginPanel } from "@/components/login-panel";
import { ProjectsPanel } from "@/components/projects-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { Sidebar } from "@/components/sidebar";
import type { OkapiProject } from "@/lib/supabase";

function HomeApp() {
  const { user, displayName, signOut, ready } = useAuth();
  const [activeNav, setActiveNav] = useState("home");
  const [resetKey, setResetKey] = useState(0);
  const [openProject, setOpenProject] = useState<OkapiProject | null>(null);
  const [openInStudio, setOpenInStudio] = useState(false);

  const navigate = useCallback(
    (id: string) => {
      if (id === "auth-login" || id === "login") {
        setActiveNav("login");
        return;
      }
      if (id === "logout") {
        void signOut();
        setActiveNav("login");
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
        setActiveNav("home");
        return;
      }
      if (id === "projects" || id === "settings") {
        setActiveNav(id);
        return;
      }
      setActiveNav("home");
    },
    [signOut],
  );

  const startNewProject = useCallback(() => {
    setOpenProject(null);
    setOpenInStudio(false);
    setActiveNav("home");
    setResetKey((k) => k + 1);
  }, []);

  const handleOpenProject = useCallback((project: OkapiProject) => {
    setOpenProject(project);
    setOpenInStudio(true);
    setActiveNav("home");
    setResetKey((k) => k + 1);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-okapi-ink/55">Chargement Okapi…</p>
      </div>
    );
  }

  const sidebarActive =
    activeNav === "projects" || activeNav === "settings"
      ? activeNav
      : "home";

  return (
    <div className="relative z-10 flex min-h-screen w-full gap-0 p-3 lg:gap-1 lg:p-4">
      <Sidebar
        activeNav={sidebarActive}
        onNavChange={navigate}
        onNewProject={startNewProject}
        userLabel={user ? displayName : "Invité"}
        loggedIn={Boolean(user)}
      />

      <div className="relative z-0 min-w-0 flex-1">
        {activeNav === "settings" ? (
          <SettingsPanel onBack={() => setActiveNav("home")} />
        ) : activeNav === "login" ? (
          <LoginPanel
            onBack={() => setActiveNav("home")}
            onSuccess={() => setActiveNav("home")}
          />
        ) : activeNav === "projects" ? (
          <ProjectsPanel
            onBack={() => setActiveNav("home")}
            onOpenProject={handleOpenProject}
            onCreateNew={startNewProject}
            onNeedLogin={() => setActiveNav("login")}
          />
        ) : (
          <HomeDashboard
            section="dashboard"
            resetKey={resetKey}
            initialProject={openProject}
            openInStudio={openInStudio}
            onGoHome={() => setActiveNav("home")}
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
