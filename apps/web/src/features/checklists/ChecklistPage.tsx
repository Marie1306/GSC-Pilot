import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageProductionChecklist } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchChecklistThicknesses, fetchChecklistSteps } from "../settings/api.js";
import { fetchProjects } from "../projects/api.js";
import { createChecklist, fetchActiveChecklistItems, setChecklistItemStepCompleted, type ChecklistDto } from "./api.js";
import { ChecklistEntryModal } from "./ChecklistEntryModal.js";
import "./checklist.css";

/**
 * Checklist de production (21 août 2026, spec confirmée en détail avec
 * l'utilisatrice) — vue active tous projets confondus, filtrable par étape
 * et épaisseur (ex. « le gars au plasma filtre toutes les pièces plasma en
 * 12GA »). Accessible à tous sauf Magasinier (canAccessProductionChecklist).
 * Création réservée à Direction (canManageProductionChecklist).
 */
export function ChecklistPage() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [stepFilter, setStepFilter] = useState("");
  const [thicknessFilter, setThicknessFilter] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newProjectId, setNewProjectId] = useState("");
  const [newAssemblyLabel, setNewAssemblyLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeChecklist, setActiveChecklist] = useState<ChecklistDto | null>(null);

  const stepsQuery = useQuery({ queryKey: ["checklist-steps"], queryFn: fetchChecklistSteps });
  const thicknessesQuery = useQuery({ queryKey: ["checklist-thicknesses"], queryFn: fetchChecklistThicknesses });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects, enabled: showNewForm });
  const itemsQuery = useQuery({
    queryKey: ["checklist", "active-items", stepFilter, thicknessFilter],
    queryFn: () => fetchActiveChecklistItems({ stepId: stepFilter || undefined, thickness: thicknessFilter || undefined }),
  });

  const invalidateItems = () => void queryClient.invalidateQueries({ queryKey: ["checklist", "active-items"] });

  const createMutation = useMutation({
    mutationFn: () => createChecklist(newProjectId, newAssemblyLabel.trim() || undefined),
    onSuccess: ({ checklist }) => {
      setShowNewForm(false);
      setNewProjectId("");
      setNewAssemblyLabel("");
      setError(null);
      setActiveChecklist(checklist);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, stepId, completed }: { itemId: string; stepId: string; completed: boolean }) =>
      setChecklistItemStepCompleted(itemId, stepId, completed),
    onSuccess: invalidateItems,
  });

  if (!employee) return null;
  const canManage = canManageProductionChecklist(employee.persona);
  const activeSteps = stepsQuery.data?.filter((s) => s.active) ?? [];
  const activeThicknesses = thicknessesQuery.data?.filter((t) => t.active) ?? [];
  const items = itemsQuery.data?.items ?? [];
  const canCreate = newProjectId.length > 0 && !createMutation.isPending;

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ marginTop: 0, fontSize: 20 }}>Checklist de production</h1>
            <p style={{ color: "var(--gsc-color-muted)", margin: 0 }}>
              Pièces fabriquées à l'interne — MEP, DXF, Plasma, Pliage, Usinage, Soudage, CQ, Peinture. Disparaît une fois toutes les
              étapes complétées; toujours conservée dans l'archive du projet.
            </p>
          </div>
          {canManage && !showNewForm && (
            <button type="button" className="btn btn-small" onClick={() => setShowNewForm(true)}>
              + Nouvelle checklist
            </button>
          )}
        </div>

        {showNewForm && (
          <form
            className="form-grid"
            style={{ marginTop: 14 }}
            onSubmit={(event) => {
              event.preventDefault();
              if (canCreate) createMutation.mutate();
            }}
          >
            <div className="field">
              <label>Projet</label>
              <select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)}>
                <option value="" disabled>
                  Sélectionner…
                </option>
                {projectsQuery.data?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectNumber} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Assemblage (facultatif)</label>
              <input value={newAssemblyLabel} onChange={(e) => setNewAssemblyLabel(e.target.value)} placeholder="ex. 02-01-000" />
            </div>
            <div className="field field-full" style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-small" disabled={!canCreate}>
                {createMutation.isPending ? "…" : "Créer"}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowNewForm(false)}>
                Annuler
              </button>
            </div>
          </form>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Filtrer par étape</label>
            <select value={stepFilter} onChange={(e) => setStepFilter(e.target.value)}>
              <option value="">Toutes</option>
              {activeSteps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Filtrer par épaisseur</label>
            <select value={thicknessFilter} onChange={(e) => setThicknessFilter(e.target.value)}>
              <option value="">Toutes</option>
              {activeThicknesses.map((t) => (
                <option key={t.id} value={t.label}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {itemsQuery.isError && <p className="form-error" style={{ marginTop: 14 }}>Impossible de charger la checklist.</p>}
        {itemsQuery.isSuccess && items.length === 0 && (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: 14 }}>Rien à faire pour l'instant.</p>
        )}

        {items.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table className="shortlist-table checklist-grid">
              <thead>
                <tr>
                  <th>Projet</th>
                  <th>Sous-assemblage</th>
                  <th>Pièce</th>
                  <th className="num">Qté</th>
                  <th>Épais.</th>
                  <th>Matériaux</th>
                  {activeSteps.map((s) => (
                    <th key={s.id} title={s.label}>
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={item.kind === "subassembly" ? "checklist-row-subassembly" : ""}>
                    <td>
                      {item.projectNumber}
                      <div className="cell-sub">{item.assemblyLabel}</div>
                    </td>
                    <td>{item.parentNumber ?? (item.kind === "subassembly" ? "(sous-assemblage)" : "—")}</td>
                    <td>{item.number}</td>
                    <td className="num">{item.quantity ?? "—"}</td>
                    <td>{item.thickness ?? "—"}</td>
                    <td>{item.material ?? "—"}</td>
                    {activeSteps.map((step) => {
                      const itemStep = item.steps.find((s) => s.stepId === step.id);
                      if (!itemStep?.active) return <td key={step.id} className="checklist-cell-na" />;
                      return (
                        <td key={step.id}>
                          <input
                            type="checkbox"
                            checked={itemStep.completed}
                            disabled={toggleMutation.isPending}
                            onChange={(e) => toggleMutation.mutate({ itemId: item.id, stepId: step.id, completed: e.target.checked })}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeChecklist && <ChecklistEntryModal checklist={activeChecklist} onClose={() => setActiveChecklist(null)} />}
    </div>
  );
}
