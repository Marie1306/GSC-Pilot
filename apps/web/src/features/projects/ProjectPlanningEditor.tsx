import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { canCreateProjectDirectly } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { updateProjectPlanning, type ProjectDetail, type UpdateProjectPlanningInput } from "./api.js";

interface ProjectPlanningEditorProps {
  project: ProjectDetail;
}

type FormState = Record<keyof UpdateProjectPlanningInput, string>;

function toFormState(project: ProjectDetail): FormState {
  return {
    sold: String(project.sold ?? 0),
    plannedHours: String(project.plannedHours),
    plannedPurchases: String(project.plannedPurchases ?? 0),
    installationPlannedHours: String(project.installationPlannedHours),
    installationPlannedCost: String(project.installationPlannedCost ?? 0),
  };
}

/**
 * Remplir après coup les champs qu'un budgétaire aurait fournis — demandé
 * le 19 août 2026 : certaines soumissions se vendent seulement avec un
 * montant global (compétition féroce, plusieurs envoyées en même temps),
 * sans détail d'heures par catégorie. Réservé aux projets SANS budgétaire
 * d'origine — sur un projet converti, ces champs restent gelés depuis la
 * conversion (voir updateProjectPlanning côté serveur, qui refuse aussi).
 *
 * Chaque champ est indépendant : remplir les heures ne touche jamais le
 * prix vendu, et vice-versa — confirmé explicitement par l'utilisatrice,
 * pas de recalcul croisé nulle part ici.
 */
export function ProjectPlanningEditor({ project }: ProjectPlanningEditorProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toFormState(project));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const patch: UpdateProjectPlanningInput = {};
      (Object.keys(form) as (keyof FormState)[]).forEach((key) => {
        const value = form[key].trim();
        if (value !== "") patch[key] = Number(value);
      });
      return updateProjectPlanning(project.id, patch);
    },
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  if (project.budgetId || !employee) return null;
  const canEdit = canCreateProjectDirectly(employee.persona);
  const hasInvoicePlan = (project.sold ?? 0) > 0;

  function set(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <div className="card" style={{ marginBottom: 20, background: "var(--gsc-color-blue-soft)", border: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, color: "var(--gsc-color-blue)" }}>Projet sans budgétaire</h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--gsc-color-ink)" }}>
            Vendu directement, sans détail d'heures par catégorie (ex. soumissions envoyées en compétition). Les champs ci-dessous sont
            indépendants — en remplir un ne change jamais les autres, surtout jamais le prix vendu.
          </p>
        </div>
      </div>

      {!canEdit && !editing && (
        <p style={{ marginTop: 10, fontSize: 13, color: "var(--gsc-color-muted)" }}>
          Direction ou Propriétaire peuvent remplir ces champs.
        </p>
      )}

      {canEdit && !editing && (
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              setForm(toFormState(project));
              setEditing(true);
            }}
          >
            Remplir les données planifiées
          </button>
        </div>
      )}

      {canEdit && editing && (
        <form className="form-grid" style={{ marginTop: 14 }} onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="pp-sold">Prix vendu ($)</label>
            <input id="pp-sold" type="number" min="0" step="0.01" value={form.sold} onChange={(e) => set("sold", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pp-plannedHours">Heures planifiées (total)</label>
            <input
              id="pp-plannedHours"
              type="number"
              min="0"
              step="0.25"
              value={form.plannedHours}
              onChange={(e) => set("plannedHours", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pp-plannedPurchases">Achats prévus ($)</label>
            <input
              id="pp-plannedPurchases"
              type="number"
              min="0"
              step="0.01"
              value={form.plannedPurchases}
              onChange={(e) => set("plannedPurchases", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pp-installationPlannedHours">Installation planifiée (h)</label>
            <input
              id="pp-installationPlannedHours"
              type="number"
              min="0"
              step="0.25"
              value={form.installationPlannedHours}
              onChange={(e) => set("installationPlannedHours", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pp-installationPlannedCost">Installation planifiée ($)</label>
            <input
              id="pp-installationPlannedCost"
              type="number"
              min="0"
              step="0.01"
              value={form.installationPlannedCost}
              onChange={(e) => set("installationPlannedCost", e.target.value)}
            />
          </div>

          {!hasInvoicePlan && Number(form.sold) > 0 && (
            <p className="field-full" style={{ margin: 0, fontSize: 12, color: "var(--gsc-color-muted)" }}>
              Le plan de facturation sera généré automatiquement à l'enregistrement (aucun encore présent pour ce projet).
            </p>
          )}

          {error && (
            <p className="form-error field-full" style={{ margin: 0 }}>
              {error}
            </p>
          )}

          <div className="field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-small" disabled={mutation.isPending}>
              {mutation.isPending ? "…" : "Enregistrer"}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
