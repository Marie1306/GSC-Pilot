import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BUDGET_CATEGORY_LABELS, type BudgetCategorySlug } from "@gsc-pilot/business-rules";
import {
  fetchPunchableTasks,
  createPunchableTask,
  updatePunchableTask,
  movePunchableTask,
  type PunchableTaskDto,
} from "./api.js";
import "./settings.css";

// Ordre + libellés confirmés le 20 août 2026 : les 5 catégories punchables
// liées au budgétaire, plus Service et Amélioration GSC (déjà anticipée au
// schéma). Déplacement/Livraison/Perte de temps (vus dans la v19) déclinés
// pour l'instant — jamais ajoutés sans confirmation.
const CATEGORY_ORDER = ["conception", "fabrication", "panelProgramming", "assemblyTest", "installationLabor", "service", "internal"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  ...BUDGET_CATEGORY_LABELS,
  service: "Service",
  internal: "Amélioration GSC",
};
// Ces 5 catégories SONT le modèle de budgétaire (BudgetModelRow, une par
// tâche) — voir punchableTasks.ts, backend. Ajouter/modifier une tâche ici
// crée/modifie directement la ligne correspondante, y compris son taux
// horaire, qui alimente ensuite les projets réels via le budgétaire.
const BUDGET_LINKED_CATEGORIES = new Set(["conception", "fabrication", "panelProgramming", "assemblyTest", "installationLabor"]);

export function PunchableTasksCard() {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ["punchable-tasks"], queryFn: fetchPunchableTasks });
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [newLabelByCategory, setNewLabelByCategory] = useState<Record<string, string>>({});
  const [newRateByCategory, setNewRateByCategory] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["punchable-tasks"] });

  const createMutation = useMutation({
    mutationFn: ({ category, label, hourlyRate }: { category: string; label: string; hourlyRate?: number }) =>
      createPunchableTask(category, label, hourlyRate),
    onSuccess: (_, variables) => {
      setNewLabelByCategory((current) => ({ ...current, [variables.category]: "" }));
      setNewRateByCategory((current) => ({ ...current, [variables.category]: "" }));
      setError(null);
      invalidate();
    },
    onError: () => setError("Erreur — réessayez."),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      update,
    }: {
      id: string;
      update: { label?: string; active?: boolean; specificServiceRate?: number | null; hourlyRate?: number };
    }) => updatePunchableTask(id, update),
    onSuccess: invalidate,
  });
  const moveMutation = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: "up" | "down" }) => movePunchableTask(id, direction),
    onSuccess: invalidate,
  });

  const tasks = tasksQuery.data?.tasks ?? [];
  const byCategory = new Map<string, PunchableTaskDto[]>();
  for (const task of tasks) {
    const list = byCategory.get(task.category) ?? [];
    list.push(task);
    byCategory.set(task.category, list);
  }
  const categories = CATEGORY_ORDER.filter((category) => category in CATEGORY_LABELS);

  function labelDraftFor(task: PunchableTaskDto): string {
    return labelDrafts[task.id] ?? task.label;
  }
  function serviceRateDraftFor(task: PunchableTaskDto): string {
    return rateDrafts[task.id] ?? (task.specificServiceRate !== null ? String(task.specificServiceRate) : "");
  }
  function hourlyRateDraftFor(task: PunchableTaskDto): string {
    return rateDrafts[task.id] ?? (task.hourlyRate !== null ? String(task.hourlyRate) : "");
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Tâches punchables par catégorie</h2>
      <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -8 }}>
        Ajouter, renommer, réordonner ou désactiver une tâche — les punchs déjà enregistrés restent liés à la tâche, jamais cassés en la
        désactivant. Pour Conception/Fabrication/Panneau &amp; programmation/Assemblage &amp; test/Installation, chaque tâche EST une
        ligne du modèle de budgétaire (même taux horaire, utilisé pour tous les futurs budgétaires et projets) — pas deux choses
        séparées à synchroniser.
      </p>

      {categories.map((category) => {
        const categoryTasks = (byCategory.get(category) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
        const newLabel = newLabelByCategory[category] ?? "";
        const newRate = newRateByCategory[category] ?? "";
        const isService = category === "service";
        const isBudgetLinked = BUDGET_LINKED_CATEGORIES.has(category);
        const canAdd = isBudgetLinked ? newLabel.trim().length > 0 && Number(newRate) > 0 : newLabel.trim().length > 0;
        return (
          <div key={category} style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>{CATEGORY_LABELS[category as BudgetCategorySlug] ?? category}</h3>
            {categoryTasks.length === 0 ? (
              <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune tâche pour l'instant.</p>
            ) : (
              <div className="table-scroll">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>Tâche</th>
                    {isService && <th>Tarif spécifique ($/h)</th>}
                    {isBudgetLinked && <th>Taux horaire ($/h)</th>}
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {categoryTasks.map((task, index) => {
                    const labelDraft = labelDraftFor(task);
                    const labelChanged = labelDraft.trim() !== task.label;
                    const serviceRateDraft = serviceRateDraftFor(task);
                    const serviceRateChanged = isService && (serviceRateDraft.trim() === "" ? null : Number(serviceRateDraft)) !== task.specificServiceRate;
                    const hourlyRateDraft = hourlyRateDraftFor(task);
                    const hourlyRateChanged = isBudgetLinked && hourlyRateDraft.trim() !== "" && Number(hourlyRateDraft) !== task.hourlyRate;
                    const hasChange = labelChanged || serviceRateChanged || hourlyRateChanged;
                    return (
                      <tr key={task.id} className={task.active ? "" : "settings-row-inactive"}>
                        <td>
                          <input
                            type="text"
                            value={labelDraft}
                            onChange={(event) => setLabelDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                          />
                        </td>
                        {isService && (
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="Taux de la classe"
                              style={{ maxWidth: 130 }}
                              value={serviceRateDraft}
                              onChange={(event) => setRateDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                            />
                          </td>
                        )}
                        {isBudgetLinked && (
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              style={{ maxWidth: 100 }}
                              value={hourlyRateDraft}
                              onChange={(event) => setRateDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                            />
                          </td>
                        )}
                        <td>{task.active ? "Active" : "Désactivée"}</td>
                        <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            disabled={index === 0 || moveMutation.isPending}
                            onClick={() => moveMutation.mutate({ id: task.id, direction: "up" })}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            disabled={index === categoryTasks.length - 1 || moveMutation.isPending}
                            onClick={() => moveMutation.mutate({ id: task.id, direction: "down" })}
                          >
                            ↓
                          </button>
                          {hasChange && labelDraft.trim().length > 0 && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() =>
                                updateMutation.mutate({
                                  id: task.id,
                                  update: {
                                    ...(labelChanged && { label: labelDraft.trim() }),
                                    ...(serviceRateChanged && { specificServiceRate: serviceRateDraft.trim() === "" ? null : Number(serviceRateDraft) }),
                                    ...(hourlyRateChanged && { hourlyRate: Number(hourlyRateDraft) }),
                                  },
                                })
                              }
                            >
                              Enregistrer
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => updateMutation.mutate({ id: task.id, update: { active: !task.active } })}
                          >
                            {task.active ? "Désactiver" : "Réactiver"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Nouvelle tâche"
                style={{ maxWidth: 220 }}
                value={newLabel}
                onChange={(event) => setNewLabelByCategory((current) => ({ ...current, [category]: event.target.value }))}
              />
              {isBudgetLinked && (
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Taux horaire ($/h)"
                  style={{ maxWidth: 150 }}
                  value={newRate}
                  onChange={(event) => setNewRateByCategory((current) => ({ ...current, [category]: event.target.value }))}
                />
              )}
              <button
                type="button"
                className="btn btn-small"
                disabled={!canAdd || createMutation.isPending}
                onClick={() =>
                  createMutation.mutate({ category, label: newLabel.trim(), hourlyRate: isBudgetLinked ? Number(newRate) : undefined })
                }
              >
                + Ajouter
              </button>
            </div>
          </div>
        );
      })}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
