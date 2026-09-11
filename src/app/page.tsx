"use client";

import { useState } from "react";
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

  function navigate(id: string) {
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
      setActiveNav("home");
      return;
    }
    if (id === "projects" || id === "settings") {
      setActiveNav(id);
      return;
    }
    setActiveNav("home");
  }

  function startNewProject() {
    setOpenProject(null);
    setActiveNav("home");
    setResetKey((k) => k + 1);
  }

  function handleOpenProject(project: OkapiProject) {
    setOpenProject(project);
    setActiveNav("home");
    setResetKey((k) => k + 1);
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-okapi-ink/50">
        Chargement Okapi…
      </div>
    );
  }

  return (
    <div className="relative z-10 flex min-h-screen w-full p-3 lg:p-4">
      <Sidebar
        activeNav={activeNav === "home" ? "home" : activeNav}
        onNavChange={navigate}
        onNewProject={startNewProject}
        userLabel={user ? displayName : "Invité"}
        loggedIn={Boolean(user)}
      />

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
          onGoHome={() => setActiveNav("home")}
          onNavigate={navigate}
        />
      )}
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
