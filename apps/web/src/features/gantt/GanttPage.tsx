import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canEditGanttSchedule } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import { fetchGanttSchedule, fetchGanttReadyQueue, assignProductionTask, setProductionTaskCompleted, type GanttScheduledTaskDto } from "./api.js";
import { GanttEntryPopup, type GanttEntryTarget } from "./GanttEntryPopup.js";
import { InterruptionsPanel } from "./InterruptionsPanel.js";
import "./gantt.css";

function formatShortDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
}
function formatDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Gantt de production (21 août 2026, phase A ; moteur automatique 31 août
 * 2026) — file d'attente "prêt mais pas entré" (Roulements + lots de
 * Projet, geste "Activer"/"Entrer" via GanttEntryPopup), calendrier
 * chronologique (horizon 30 jours ouvrables, recalculé à chaque lecture —
 * computeProductionSchedule, jamais une date stockée, voir
 * gantt-schedule.ts) et interruptions de capacité. Tableau plutôt qu'une
 * grille CSS pure : mêmes classes .table-scroll/.shortlist-table déjà
 * utilisées par les 44 autres tableaux du site (défilement horizontal
 * cohérent, mobile compris) — aucune librairie de graphique ajoutée.
 * Édition Direction seulement (canEditGanttSchedule) — Administration et
 * Propriétaire ont un accès visuel seulement (spec confirmée).
 */
export function GanttPage() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = employee ? canEditGanttSchedule(employee.persona) : false;

  const scheduleQuery = useQuery({ queryKey: ["gantt", "schedule"], queryFn: fetchGanttSchedule });
  const queueQuery = useQuery({ queryKey: ["gantt", "ready-queue"], queryFn: fetchGanttReadyQueue, enabled: canEdit });
  const employeesQuery = useQuery({ queryKey: ["time-entries", "employees"], queryFn: fetchPunchableEmployees, enabled: canEdit });

  const [entryTarget, setEntryTarget] = useState<GanttEntryTarget | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["gantt"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const assignMutation = useMutation({
    mutationFn: ({ id, employeeId }: { id: string; employeeId: string | null }) => assignProductionTask(id, employeeId),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const completeMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => setProductionTaskCompleted(id, completed),
    onSuccess: invalidate,
    onError: onMutationError,
  });

  if (!employee) return null;

  const schedule = scheduleQuery.data?.schedule;
  const queue = queueQuery.data?.queue;
  const horizonDays = schedule?.horizonDays ?? [];
  const rows = [...(schedule?.tasks ?? [])].sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel) || a.categoryLabel.localeCompare(b.categoryLabel));
  const unscheduled = schedule?.unscheduled ?? [];
  const completedTasks = schedule?.completed ?? [];
  const hasQueue = !!queue && (queue.rollings.length > 0 || queue.projectBatches.length > 0);

  function renderTaskRow(task: GanttScheduledTaskDto, showDates: boolean): ReactNode {
    return (
      <tr key={task.id} className={showDates ? undefined : "gantt-task-done"}>
        <td>
          {task.ownerLabel}
          <div className="cell-sub">
            {task.categoryLabel}
            {task.subcategory && task.subcategory !== task.category ? ` — ${task.subcategory}` : ""}
          </div>
        </td>
        <td className="num">{task.plannedHours} h</td>
        <td className="num">{task.priority}</td>
        {showDates && (
          <>
            {horizonDays.map((day) => {
              const allocation = task.allocations.find((a) => a.date === day);
              return (
                <td key={day} className={allocation ? "gantt-cell-busy" : undefined} title={allocation ? allocation.employeeName : undefined}>
                  {allocation ? allocation.effectiveHours : ""}
                </td>
              );
            })}
          </>
        )}
        <td>
          {canEdit ? (
            <select
              value={task.pinnedEmployeeId ?? ""}
              onChange={(e) => assignMutation.mutate({ id: task.id, employeeId: e.target.value || null })}
              disabled={assignMutation.isPending}
            >
              <option value="">Le moteur choisit</option>
              {employeesQuery.data?.employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          ) : (
            (task.pinnedEmployeeName ?? "Le moteur choisit")
          )}
        </td>
        <td>
          {canEdit && (
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={completeMutation.isPending}
              onClick={() => completeMutation.mutate({ id: task.id, completed: showDates })}
            >
              {showDates ? "Marquer complétée" : "Rouvrir"}
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div>
      {error && (
        <div className="card">
          <p className="form-error">{error}</p>
        </div>
      )}

      {canEdit && hasQueue && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-band-header">
            <h3>Prêt mais pas encore entré</h3>
          </div>

          {queue!.rollings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Roulements</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {queue!.rollings.map((rolling) => (
                  <div key={rolling.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>
                      {rolling.rollingNumber} — {rolling.contactName}
                      {rolling.dueDate && <span className="cell-sub"> · Échéance client {formatDate(rolling.dueDate)}</span>}
                    </span>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() =>
                        setEntryTarget({ kind: "rolling", id: rolling.id, label: `${rolling.rollingNumber} — ${rolling.contactName}`, currentPriority: rolling.priority })
                      }
                    >
                      Activer
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {queue!.projectBatches.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Lots de projet</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {queue!.projectBatches.map((batch) => (
                  <div key={`${batch.batchKind}-${batch.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>
                      {batch.projectNumber} — {batch.projectName} · {batch.batchLabel}
                      <span className="cell-sub">
                        {" "}
                        {batch.taskCount} tâche(s), {batch.totalPlannedHours} h
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() =>
                        setEntryTarget({
                          kind: "project_batch",
                          projectId: batch.projectId,
                          projectLabel: `${batch.projectNumber} — ${batch.projectName}`,
                          batchId: batch.id,
                          batchLabel: batch.batchLabel,
                          currentPriority: batch.projectPriority,
                        })
                      }
                    >
                      Entrer
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-band-header">
          <h3>Calendrier de production</h3>
        </div>

        {scheduleQuery.isError && <p className="form-error">Impossible de charger le calendrier.</p>}

        {schedule && rows.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: 10 }}>Aucune tâche entrée au Gantt pour l'instant.</p>}

        {schedule && rows.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="shortlist-table gantt-calendar">
              <thead>
                <tr>
                  <th>Tâche</th>
                  <th className="num">Heures</th>
                  <th className="num">Priorité</th>
                  {horizonDays.map((day) => (
                    <th key={day}>{formatShortDate(day)}</th>
                  ))}
                  <th>Employé imposé (optionnel)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>{rows.map((task) => renderTaskRow(task, true))}</tbody>
            </table>
          </div>
        )}

        {unscheduled.length > 0 && (
          <p className="form-error" style={{ marginTop: 10 }}>
            {unscheduled.length} tâche(s) ne se planifient pas dans l'horizon de 30 jours ouvrables — capacité insuffisante ou compétence manquante :{" "}
            {unscheduled.map((t) => `${t.ownerLabel} (${t.categoryLabel})`).join(", ")}.
          </p>
        )}

        {completedTasks.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowCompleted((v) => !v)}>
              {showCompleted ? "Masquer" : "Voir"} les tâches complétées ({completedTasks.length})
            </button>
            {showCompleted && (
              <div className="table-scroll" style={{ marginTop: 10 }}>
                <table className="shortlist-table">
                  <thead>
                    <tr>
                      <th>Tâche</th>
                      <th className="num">Heures</th>
                      <th className="num">Priorité</th>
                      <th>Employé imposé (optionnel)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>{completedTasks.map((task) => renderTaskRow(task, false))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <InterruptionsPanel canEdit={canEdit} />

      {entryTarget && <GanttEntryPopup target={entryTarget} onClose={() => setEntryTarget(null)} />}
    </div>
  );
}
