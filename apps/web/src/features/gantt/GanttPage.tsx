import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canEditGanttSchedule } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import { fetchProductionTasks, assignProductionTask, setProductionTaskCompleted, type ProductionTaskDto } from "./api.js";
import "./gantt.css";

function groupByProject(tasks: ProductionTaskDto[]): { projectId: string; projectNumber: string; projectName: string; tasks: ProductionTaskDto[] }[] {
  const groups = new Map<string, { projectId: string; projectNumber: string; projectName: string; tasks: ProductionTaskDto[] }>();
  for (const task of tasks) {
    if (!groups.has(task.projectId)) {
      groups.set(task.projectId, { projectId: task.projectId, projectNumber: task.projectNumber, projectName: task.projectName, tasks: [] });
    }
    groups.get(task.projectId)!.tasks.push(task);
  }
  return [...groups.values()];
}

/**
 * Gantt de production (21 août 2026, phase A) — tâches issues des
 * sous-assemblages et avenants, dépendances, affectation et complétion.
 * Édition Direction seulement (canEditGanttSchedule) — Administration et
 * Propriétaire ont un accès visuel seulement (spec confirmée). Ne comporte
 * PAS encore le moteur de planification automatique (horizon/capacité/
 * vacances) — phase séparée, à venir.
 */
export function GanttPage() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ["gantt", "tasks"], queryFn: fetchProductionTasks });
  const canEdit = employee ? canEditGanttSchedule(employee.persona) : false;
  const employeesQuery = useQuery({ queryKey: ["time-entries", "employees"], queryFn: fetchPunchableEmployees, enabled: canEdit });
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["gantt", "tasks"] });
  };

  const assignMutation = useMutation({
    mutationFn: ({ id, employeeId }: { id: string; employeeId: string | null }) => assignProductionTask(id, employeeId),
    onSuccess: invalidate,
    onError: () => setError("Une erreur est survenue — réessayez."),
  });
  const completeMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => setProductionTaskCompleted(id, completed),
    onSuccess: invalidate,
    onError: () => setError("Une erreur est survenue — réessayez."),
  });

  if (!employee) return null;
  const tasks = tasksQuery.data?.tasks ?? [];
  const groups = groupByProject(tasks);

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Gantt de production</h1>
        <p style={{ color: "var(--gsc-color-muted)", margin: 0 }}>
          Tâches issues des sous-assemblages et des avenants, tous projets actifs confondus.
          {!canEdit && " Accès visuel seulement — Direction gère les affectations et la complétion."}
        </p>
      </div>

      {error && (
        <div className="card" style={{ marginTop: 20 }}>
          <p className="form-error">{error}</p>
        </div>
      )}

      {tasksQuery.isError && (
        <div className="card" style={{ marginTop: 20 }}>
          <p className="form-error">Impossible de charger le Gantt de production.</p>
        </div>
      )}

      {tasksQuery.isSuccess && groups.length === 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune tâche de production pour l'instant.</p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.projectId} className="card" style={{ marginTop: 20 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>
            {group.projectNumber} — {group.projectName}
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Tâche</th>
                  <th className="num">Heures</th>
                  <th>Affectation</th>
                  <th>Statut</th>
                  {canEdit && <th></th>}
                </tr>
              </thead>
              <tbody>
                {group.tasks.map((task) => {
                  const isBlocked = task.blockedByNames.length > 0 && !task.ganttCompleted;
                  return (
                    <tr key={task.id} className={task.ganttCompleted ? "gantt-task-done" : ""}>
                      <td>
                        {task.name}
                        {isBlocked && <div className="cell-sub">Bloquée par : {task.blockedByNames.join(", ")}</div>}
                      </td>
                      <td className="num">{task.plannedHours} h</td>
                      <td>
                        {canEdit ? (
                          <select
                            value={task.assignedEmployeeId ?? ""}
                            onChange={(e) => assignMutation.mutate({ id: task.id, employeeId: e.target.value || null })}
                            disabled={assignMutation.isPending}
                          >
                            <option value="">Non assigné</option>
                            {employeesQuery.data?.employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (task.assignedEmployeeName ?? "—")
                        )}
                      </td>
                      <td>
                        {task.ganttCompleted ? (
                          <span className="badge-pill badge-conforme">Complétée</span>
                        ) : isBlocked ? (
                          <span className="badge-pill badge-at_risk">Bloquée</span>
                        ) : (
                          <span className="badge-pill badge-neutral">Prête</span>
                        )}
                      </td>
                      {canEdit && (
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            disabled={completeMutation.isPending}
                            onClick={() => completeMutation.mutate({ id: task.id, completed: !task.ganttCompleted })}
                          >
                            {task.ganttCompleted ? "Rouvrir" : "Marquer complétée"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
