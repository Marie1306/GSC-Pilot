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

export function PunchableTasksCard() {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ["punchable-tasks"], queryFn: fetchPunchableTasks });
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [newLabelByCategory, setNewLabelByCategory] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["punchable-tasks"] });

  const createMutation = useMutation({
    mutationFn: ({ category, label }: { category: string; label: string }) => createPunchableTask(category, label),
    onSuccess: (_, variables) => {
      setNewLabelByCategory((current) => ({ ...current, [variables.category]: "" }));
      setError(null);
      invalidate();
    },
    onError: () => setError("Erreur — réessayez."),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: { label?: string; active?: boolean; specificServiceRate?: number | null } }) =>
      updatePunchableTask(id, update),
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
  function rateDraftFor(task: PunchableTaskDto): string {
    return rateDrafts[task.id] ?? (task.specificServiceRate !== null ? String(task.specificServiceRate) : "");
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Tâches punchables par catégorie</h2>
      <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -8 }}>
        Ajouter, renommer, réordonner ou désactiver une tâche — les punchs déjà enregistrés restent liés à la tâche, jamais cassés en la
        désactivant.
      </p>

      {categories.map((category) => {
        const categoryTasks = (byCategory.get(category) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
        const newLabel = newLabelByCategory[category] ?? "";
        const isService = category === "service";
        return (
          <div key={category} style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>{CATEGORY_LABELS[category as BudgetCategorySlug] ?? category}</h3>
            {categoryTasks.length === 0 ? (
              <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune tâche pour l'instant.</p>
            ) : (
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>Tâche</th>
                    {isService && <th>Tarif spécifique ($/h)</th>}
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {categoryTasks.map((task, index) => {
                    const labelDraft = labelDraftFor(task);
                    const labelChanged = labelDraft.trim() !== task.label;
                    const rateDraft = rateDraftFor(task);
                    const rateChanged = (rateDraft.trim() === "" ? null : Number(rateDraft)) !== task.specificServiceRate;
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
                              value={rateDraft}
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
                          {(labelChanged || rateChanged) && labelDraft.trim().length > 0 && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() =>
                                updateMutation.mutate({
                                  id: task.id,
                                  update: {
                                    ...(labelChanged && { label: labelDraft.trim() }),
                                    ...(rateChanged && { specificServiceRate: rateDraft.trim() === "" ? null : Number(rateDraft) }),
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
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Nouvelle tâche"
                style={{ maxWidth: 220 }}
                value={newLabel}
                onChange={(event) => setNewLabelByCategory((current) => ({ ...current, [category]: event.target.value }))}
              />
              <button
                type="button"
                className="btn btn-small"
                disabled={newLabel.trim().length === 0 || createMutation.isPending}
                onClick={() => createMutation.mutate({ category, label: newLabel.trim() })}
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
