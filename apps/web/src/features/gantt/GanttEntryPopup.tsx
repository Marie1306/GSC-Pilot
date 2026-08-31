import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import {
  previewGanttEntry,
  enterProjectGanttBatch,
  activateRollingGantt,
  updateProjectGanttPriority,
  updateRollingGanttPlanning,
} from "./api.js";

// Mêmes 7 catégories que ProjectSubassemblies.tsx/ProjectAmendments.tsx —
// jamais un ensemble différent, un Roulement produit dans le même atelier.
const HOURS_CATEGORIES = [
  { value: "fabrication-plasma", label: "Fabrication — Plasma" },
  { value: "fabrication-pliage", label: "Fabrication — Pliage" },
  { value: "fabrication-usinage", label: "Fabrication — Usinage" },
  { value: "fabrication-soudage", label: "Fabrication — Soudage" },
  { value: "fabrication-peinture", label: "Fabrication — Peinture" },
  { value: "programmation", label: "Programmation" },
  { value: "assemblage", label: "Assemblage" },
];

export type GanttEntryTarget =
  | { kind: "rolling"; id: string; label: string; currentPriority: number }
  | { kind: "project_batch"; projectId: string; projectLabel: string; batchId: string; batchLabel: string; currentPriority: number };

interface GanttEntryPopupProps {
  target: GanttEntryTarget;
  onClose: () => void;
}

function formatDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Fenêtre contextuelle d'entrée au Gantt (31 août 2026) — un seul composant
 * pour les deux gestes confirmés : "Activer" un Roulement (heures par
 * catégorie saisies ici, les tâches n'existent pas encore avant ce geste)
 * et "Entrer" un lot de Projet, ce lot seulement ou tout le projet (les
 * tâches existent déjà — liste de pièces ou avenant — seules leurs heures/
 * compétences sont affichées). "Voir l'aperçu" montre où ces tâches se
 * placeraient dans le calendrier réel sans jamais rien persister
 * (previewGanttEntry, vérifié réellement contre Postgres). La priorité se
 * confirme en même temps que le geste d'entrée — jamais une insertion
 * spéciale "devant" : le calendrier entier se recalcule à la lecture
 * (runGanttSchedule, tri priorité DESC), donc une priorité plus haute
 * repousse automatiquement les tâches moins prioritaires.
 */
export function GanttEntryPopup({ target, onClose }: GanttEntryPopupProps) {
  const queryClient = useQueryClient();
  const [hours, setHours] = useState<Record<string, string>>(() => Object.fromEntries(HOURS_CATEGORIES.map((c) => [c.value, ""])));
  const [priority, setPriority] = useState(String(target.currentPriority));
  const [error, setError] = useState<string | null>(null);

  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const hoursByCategory = Object.fromEntries(
    Object.entries(hours)
      .map(([key, value]) => [key, Number(value)] as const)
      .filter(([, value]) => value > 0),
  );
  const priorityNumber = Number(priority) || 0;

  const previewMutation = useMutation({
    mutationFn: () =>
      previewGanttEntry(
        target.kind === "rolling"
          ? { ownerType: "rolling", ownerId: target.id, hoursByCategory, priority: priorityNumber }
          : { ownerType: "project", ownerId: target.projectId, batchId: target.batchId, priority: priorityNumber },
      ),
    onError: onMutationError,
  });

  const afterEntry = () => {
    void queryClient.invalidateQueries({ queryKey: ["gantt"] });
    onClose();
  };

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (target.kind !== "rolling") return;
      await activateRollingGantt(target.id, hoursByCategory);
      if (priorityNumber !== target.currentPriority) await updateRollingGanttPlanning(target.id, { priority: priorityNumber });
    },
    onSuccess: afterEntry,
    onError: onMutationError,
  });

  const enterBatchMutation = useMutation({
    mutationFn: async (scope: "batch" | "whole_project") => {
      if (target.kind !== "project_batch") return;
      await enterProjectGanttBatch(target.projectId, { scope, batchId: scope === "batch" ? target.batchId : undefined });
      if (priorityNumber !== target.currentPriority) await updateProjectGanttPriority(target.projectId, priorityNumber);
    },
    onSuccess: afterEntry,
    onError: onMutationError,
  });

  const preview = previewMutation.data?.preview;
  const candidateTasks = preview?.schedule.tasks.filter((task) => preview.candidateTaskIds.includes(task.id)) ?? [];
  const candidateUnscheduled = preview?.schedule.unscheduled.filter((task) => preview.candidateTaskIds.includes(task.id)) ?? [];

  const canPreview = (target.kind === "project_batch" || Object.keys(hoursByCategory).length > 0) && !previewMutation.isPending;
  const canActivate = target.kind === "rolling" && Object.keys(hoursByCategory).length > 0 && !activateMutation.isPending;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Entrer au Gantt</h2>
            <p className="modal-subtitle">{target.kind === "rolling" ? target.label : `${target.projectLabel} — ${target.batchLabel}`}</p>
          </div>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}

          {target.kind === "rolling" ? (
            <>
              <p style={{ fontSize: 13, color: "var(--gsc-color-muted)", margin: "0 0 10px" }}>
                Heures par catégorie — un Roulement entre toujours en entier, jamais incrémentalement.
              </p>
              <div className="form-grid">
                {HOURS_CATEGORIES.map((category) => (
                  <div className="field" key={category.value}>
                    <label htmlFor={`gantt-entry-${category.value}`}>{category.label}</label>
                    <input
                      id={`gantt-entry-${category.value}`}
                      type="number"
                      min={0}
                      step="0.1"
                      value={hours[category.value]}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setHours((current) => ({ ...current, [category.value]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "var(--gsc-color-muted)", margin: "0 0 10px" }}>
              Les heures et compétences de ce lot sont déjà fixées (liste de pièces ou avenant) — rien à ressaisir ici.
            </p>
          )}

          <div className="form-grid">
            <div className="field">
              <label htmlFor="gantt-entry-priority">Priorité</label>
              <input id="gantt-entry-priority" type="number" step={1} value={priority} onChange={(e) => setPriority(e.target.value)} />
              <span className="cell-sub">Plus élevé = plus prioritaire. Départage par date d'échéance.</span>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-secondary btn-small" disabled={!canPreview} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? "…" : "Voir l'aperçu"}
            </button>
          </div>

          {preview && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>Aperçu — où ces tâches se placeraient</p>
              {candidateTasks.length === 0 && candidateUnscheduled.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Aucune tâche à planifier (heures à 0).</p>
              )}
              {candidateTasks.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table className="shortlist-table">
                    <thead>
                      <tr>
                        <th>Compétence</th>
                        <th className="num">Heures</th>
                        <th>Début prévu</th>
                        <th>Fin prévue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidateTasks.map((task) => (
                        <tr key={task.id}>
                          <td>{task.categoryLabel}</td>
                          <td className="num">{task.plannedHours} h</td>
                          <td>{task.firstScheduledDate ? formatDate(task.firstScheduledDate) : "—"}</td>
                          <td>{task.predictedCompletedDate ? formatDate(task.predictedCompletedDate) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {candidateUnscheduled.length > 0 && (
                <p className="form-error" style={{ marginTop: 8 }}>
                  {candidateUnscheduled.length} tâche(s) ne se planifient pas dans l'horizon de 30 jours ouvrables — capacité insuffisante ou compétence
                  manquante.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          {target.kind === "rolling" ? (
            <button type="button" className="btn" disabled={!canActivate} onClick={() => activateMutation.mutate()}>
              {activateMutation.isPending ? "…" : "Activer"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={enterBatchMutation.isPending}
                onClick={() => enterBatchMutation.mutate("batch")}
              >
                {enterBatchMutation.isPending ? "…" : "Entrer ce lot seulement"}
              </button>
              <button type="button" className="btn" disabled={enterBatchMutation.isPending} onClick={() => enterBatchMutation.mutate("whole_project")}>
                {enterBatchMutation.isPending ? "…" : "Entrer tout le projet"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
