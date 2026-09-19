"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  AUTOMATION_TEMPLATES,
  SCHEDULE_LABELS,
  type AutomationRow,
  type AutomationTemplate,
  type ScheduleKey,
} from "@/lib/scheduled-tasks";

type ScheduledTasksPanelProps = {
  onBack?: () => void;
  onNeedLogin?: () => void;
};

export function ScheduledTasksPanel({
  onBack,
  onNeedLogin,
}: ScheduledTasksPanelProps) {
  const { user, authFetch } = useAuth();
  const [tasks, setTasks] = useState<AutomationRow[]>([]);
  const [templates, setTemplates] =
    useState<AutomationTemplate[]>(AUTOMATION_TEMPLATES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [topicDraft, setTopicDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setTemplates(AUTOMATION_TEMPLATES);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/automations");
      const data = (await res.json().catch(() => null)) as {
        templates?: AutomationTemplate[];
        tasks?: AutomationRow[];
        error?: string;
        setupRequired?: boolean;
      } | null;
      if (data?.templates?.length) setTemplates(data.templates);
      if (data?.setupRequired) {
        setSetupRequired(true);
        setError(data.error || "Migration SQL requise.");
        setTasks([]);
        return;
      }
      if (!res.ok) {
        setError(data?.error || "Impossible de charger les automatisations.");
        return;
      }
      setSetupRequired(false);
      setTasks(data?.tasks ?? []);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  function taskFor(templateId: string) {
    return tasks.find((t) => t.template_id === templateId);
  }

  async function activate(tpl: AutomationTemplate) {
    if (!user) {
      onNeedLogin?.();
      return;
    }
    setBusyId(tpl.id);
    setError(null);
    try {
      const res = await authFetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: tpl.id,
          scheduleKey: tpl.defaultSchedule,
          topic: topicDraft[tpl.id]?.trim() || undefined,
          enabled: true,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        setupRequired?: boolean;
      } | null;
      if (!res.ok) {
        if (data?.setupRequired) setSetupRequired(true);
        setError(data?.error || "Activation impossible.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(task: AutomationRow, enabled: boolean) {
    setBusyId(task.id);
    try {
      await authFetch(`/api/automations/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(task: AutomationRow) {
    setBusyId(task.id);
    setError(null);
    try {
      const res = await authFetch(`/api/automations/${task.id}/run`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        task?: AutomationRow;
      } | null;
      if (!res.ok) {
        setError(data?.error || "Échec du run.");
        return;
      }
      if (data?.task) {
        setTasks((prev) =>
          prev.map((t) => (t.id === data.task!.id ? data.task! : t)),
        );
        setExpandedId(data.task.id);
      } else {
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function saveTopic(task: AutomationRow, topic: string) {
    setBusyId(task.id);
    try {
      await authFetch(`/api/automations/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = tasks.filter((t) => t.enabled).length;

  return (
    <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--okapi-stroke)] px-4 py-4 lg:px-8">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
            Automatisations
          </h1>
          <p className="mt-1 text-sm text-okapi-ink/50">
            Tâches planifiées — briefing, triage, contenu, veille. Fuseau Kinshasa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/70 px-4 py-2 text-sm font-medium text-okapi-ink/70"
            >
              Retour
            </button>
          ) : null}
        </div>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <section className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/70 p-5 backdrop-blur-md">
            <h2 className="font-[family-name:var(--font-syne)] text-base font-bold">
              Tâches planifiées
            </h2>
            <p className="mt-1 text-sm text-okapi-ink/45">
              Lance-les à l’heure prévue, ou quand tu en as besoin.
            </p>
            {!user ? (
              <p className="mt-3 text-sm text-okapi-ink/55">
                Parcours les modèles ci-dessous.{" "}
                <button
                  type="button"
                  onClick={() => onNeedLogin?.()}
                  className="font-semibold text-okapi-forest underline-offset-2 hover:underline"
                >
                  Connecte-toi
                </button>{" "}
                pour activer une automatisation.
              </p>
            ) : activeCount === 0 && !loading ? (
              <p className="mt-3 text-sm text-okapi-ink/45">
                Aucune tâche active pour l’instant.
              </p>
            ) : user ? (
              <p className="mt-3 text-xs font-medium text-okapi-ink/40">
                {activeCount} active{activeCount > 1 ? "s" : ""}
                {loading ? " · chargement…" : ""}
              </p>
            ) : null}
          </section>

          {error ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {error}
              {setupRequired ? (
                <span className="mt-1 block text-xs opacity-80">
                  SQL : supabase/migrations/20260319_scheduled_tasks.sql
                </span>
              ) : null}
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            {templates.map((tpl) => {
              const task = taskFor(tpl.id);
              const scheduleLabel =
                (task &&
                  SCHEDULE_LABELS[task.schedule_key as ScheduleKey]) ||
                tpl.scheduleLabel;
              const preview =
                task?.last_result?.trim() ||
                tpl.emptyHint;
              const open = expandedId === (task?.id || tpl.id);
              const busy = busyId === tpl.id || busyId === task?.id;

              return (
                <article
                  key={tpl.id}
                  className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/80 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-[family-name:var(--font-syne)] text-base font-bold text-okapi-ink">
                          {tpl.title}
                        </h3>
                        {task?.enabled ? (
                          <span className="rounded-full bg-okapi-forest/10 px-2 py-0.5 text-[10px] font-semibold text-okapi-forest">
                            Active
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-okapi-ink/50">
                        {tpl.description}
                      </p>
                      <p className="mt-2 text-xs font-medium text-okapi-ink/40">
                        {scheduleLabel}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {!task ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void activate(tpl)}
                          className="rounded-xl bg-okapi-forest px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {busy ? "…" : "Activer"}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runNow(task)}
                            className="rounded-xl border border-okapi-forest/30 bg-okapi-forest/10 px-3 py-1.5 text-xs font-semibold text-okapi-forest disabled:opacity-60"
                          >
                            {busy ? "…" : "Lancer"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void toggle(task, !task.enabled)}
                            className="rounded-xl border border-[var(--okapi-stroke)] px-3 py-1.5 text-xs font-semibold text-okapi-ink/70 disabled:opacity-60"
                          >
                            {task.enabled ? "Pause" : "Reprendre"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {tpl.needsTopic ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        value={
                          topicDraft[tpl.id] ??
                          task?.topic ??
                          ""
                        }
                        onChange={(e) =>
                          setTopicDraft((d) => ({
                            ...d,
                            [tpl.id]: e.target.value,
                          }))
                        }
                        placeholder="Sujet / concurrent / mot-clé…"
                        className="min-w-[200px] flex-1 rounded-xl border border-[var(--okapi-stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-okapi-forest/40"
                      />
                      {task ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void saveTopic(
                              task,
                              topicDraft[tpl.id] ?? task.topic ?? "",
                            )
                          }
                          className="rounded-xl border border-[var(--okapi-stroke)] px-3 py-2 text-xs font-semibold text-okapi-ink/70"
                        >
                          Sauver sujet
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(open ? null : task?.id || tpl.id)
                    }
                    className="mt-3 w-full rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/40 px-3 py-2.5 text-left text-sm text-okapi-ink/70"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-okapi-ink/35">
                      Dernier résultat
                    </span>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap">
                      {preview}
                    </p>
                    {task?.last_run_at ? (
                      <p className="mt-1 text-[10px] text-okapi-ink/35">
                        {new Date(task.last_run_at).toLocaleString("fr-FR")} ·{" "}
                        {task.run_count} run
                        {task.run_count > 1 ? "s" : ""}
                      </p>
                    ) : null}
                  </button>

                  {open && task?.last_result ? (
                    <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-[var(--okapi-stroke)] bg-white p-3 text-xs leading-relaxed text-okapi-ink/80">
                      {task.last_result}
                    </pre>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
