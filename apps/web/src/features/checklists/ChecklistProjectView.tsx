import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageProductionChecklist } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchChecklistThicknesses, fetchChecklistSteps } from "../settings/api.js";
import { fetchProjectChecklists, setChecklistItemStepCompleted, type ChecklistDto, type ChecklistItemDto, type ChecklistWithItemsDto } from "./api.js";
import { ChecklistEntryModal } from "./ChecklistEntryModal.js";
import { ChecklistItemEditModal } from "./ChecklistItemEditModal.js";
import "./checklist.css";

interface ChecklistProjectViewProps {
  projectId: string;
  initialChecklistId?: string | null;
  onBack: () => void;
}

function isItemActive(item: ChecklistItemDto): boolean {
  return item.steps.some((s) => s.active && !s.completed);
}
function isChecklistActive(checklist: ChecklistWithItemsDto): boolean {
  return checklist.items.some(isItemActive);
}

/**
 * Niveaux 2 et 3 de la page Checklist (21 août 2026, spec confirmée : « le
 * filtre reste efficace lorsqu'on rentre dans le projet, puis dans la
 * checklist choisie » — jamais transversal). Une checklist ayant tous ses
 * items complétés disparaît de cette vue (mais reste dans l'archive du
 * projet, Options du projet → Checklist de production, inchangée).
 */
export function ChecklistProjectView({ projectId, initialChecklistId, onBack }: ChecklistProjectViewProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(initialChecklistId ?? null);
  const [stepFilter, setStepFilter] = useState("");
  const [thicknessFilter, setThicknessFilter] = useState("");
  const [entryChecklist, setEntryChecklist] = useState<ChecklistDto | null>(null);
  const [editItem, setEditItem] = useState<ChecklistItemDto | null>(null);

  const checklistsQuery = useQuery({ queryKey: ["project-checklists", projectId], queryFn: () => fetchProjectChecklists(projectId) });
  const stepsQuery = useQuery({ queryKey: ["checklist-steps"], queryFn: fetchChecklistSteps });
  const thicknessesQuery = useQuery({ queryKey: ["checklist-thicknesses"], queryFn: fetchChecklistThicknesses });

  const canManage = !!employee && canManageProductionChecklist(employee.persona);
  const activeSteps = (stepsQuery.data ?? []).filter((s) => s.active);
  const activeThicknesses = (thicknessesQuery.data ?? []).filter((t) => t.active);
  const allChecklists = checklistsQuery.data?.checklists ?? [];
  const activeChecklists = allChecklists.filter(isChecklistActive);
  const selected = activeChecklists.find((c) => c.id === selectedChecklistId) ?? null;

  const invalidateItems = () => {
    void queryClient.invalidateQueries({ queryKey: ["project-checklists", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["checklist", "active-projects"] });
  };

  if (checklistsQuery.isLoading) return <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: 14 }}>Chargement…</p>;

  if (!selected) {
    return (
      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn-back" onClick={onBack}>
          ← Projets
        </button>
        {activeChecklists.length === 0 && (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: 14 }}>Aucune checklist active pour ce projet.</p>
        )}
        {activeChecklists.length > 0 && (
          <div className="project-card-grid" style={{ marginTop: 14 }}>
            {activeChecklists.map((checklist) => {
              const activeCount = checklist.items.filter(isItemActive).length;
              return (
                <div key={checklist.id} className="project-card" onClick={() => setSelectedChecklistId(checklist.id)}>
                  <div className="project-card-header">
                    <span className="project-card-number">{checklist.assemblyLabel ?? "Sans assemblage"}</span>
                  </div>
                  <div className="project-card-sub">{activeCount} pièce(s) restante(s)</div>
                  <div className="project-card-footer">
                    <span>{checklist.createdByName}</span>
                    <span className="project-card-open">Ouvrir ›</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const items = selected.items
    .filter(isItemActive)
    .filter((item) => !stepFilter || item.steps.some((s) => s.stepId === stepFilter && s.active && !s.completed))
    .filter((item) => !thicknessFilter || item.thickness === thicknessFilter);

  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" className="btn-back" onClick={() => setSelectedChecklistId(null)}>
        ← Checklists du projet
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>{selected.assemblyLabel ?? "Sans assemblage"}</h2>
        {canManage && (
          <button type="button" className="btn btn-small" onClick={() => setEntryChecklist(selected)}>
            + Ajouter
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
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

      {items.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: 14 }}>Rien à faire pour l'instant.</p>}

      {items.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <table className="shortlist-table checklist-grid">
            <thead>
              <tr>
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
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={item.kind === "subassembly" ? "checklist-row-subassembly" : ""}>
                  <td className="checklist-cell-nowrap">{item.parentNumber ?? (item.kind === "subassembly" ? "(sous-assemblage)" : "—")}</td>
                  <td className="checklist-cell-nowrap">{item.number}</td>
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
                          onChange={(e) => setChecklistItemStepCompleted(item.id, step.id, e.target.checked).then(invalidateItems)}
                        />
                      </td>
                    );
                  })}
                  {canManage && (
                    <td>
                      <button type="button" className="icon-btn" title="Modifier" onClick={() => setEditItem(item)}>
                        ✎
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entryChecklist && <ChecklistEntryModal checklist={entryChecklist} onClose={() => setEntryChecklist(null)} />}
      {editItem && <ChecklistItemEditModal item={editItem} projectId={projectId} onClose={() => setEditItem(null)} />}
    </div>
  );
}
