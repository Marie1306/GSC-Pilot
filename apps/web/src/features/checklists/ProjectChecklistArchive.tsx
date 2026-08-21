import { useQuery } from "@tanstack/react-query";
import { fetchProjectChecklists, type ChecklistItemDto } from "./api.js";

interface ProjectChecklistArchiveProps {
  projectId: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

function itemLabel(item: ChecklistItemDto): string {
  const parts = [item.thickness, item.material].filter(Boolean);
  return `${item.number}${item.quantity ? ` × ${item.quantity}` : ""}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

/**
 * Archive complète des checklists d'un projet (21 août 2026, spec
 * confirmée : « prévoir dans le module projet, d'ajouter une option
 * checklist où les checklists seront enregistrées ») — lecture seule,
 * jamais filtrée (contrairement à la vue active, tout reste visible ici,
 * y compris les items entièrement complétés).
 */
export function ProjectChecklistArchive({ projectId, onClose }: ProjectChecklistArchiveProps) {
  const checklistsQuery = useQuery({ queryKey: ["project-checklists", projectId], queryFn: () => fetchProjectChecklists(projectId) });
  const checklists = checklistsQuery.data?.checklists ?? [];

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div>
            <h2>Checklist de production — archive</h2>
            <p className="modal-subtitle">Tout est conservé ici, y compris les pièces déjà complétées.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {checklistsQuery.isLoading && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>}
          {checklistsQuery.isSuccess && checklists.length === 0 && (
            <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune checklist pour ce projet.</p>
          )}

          {checklists.map((checklist) => {
            const roots = checklist.items.filter((i) => !i.parentItemId);
            const childrenByParent = new Map<string, ChecklistItemDto[]>();
            for (const item of checklist.items) {
              if (item.parentItemId) childrenByParent.set(item.parentItemId, [...(childrenByParent.get(item.parentItemId) ?? []), item]);
            }
            return (
              <div key={checklist.id} className="card" style={{ marginBottom: 14, background: "var(--gsc-color-surface2)", border: "none" }}>
                <strong>{checklist.assemblyLabel ?? "Sans assemblage"}</strong>
                <div className="cell-sub">
                  {checklist.createdByName} · {formatDate(checklist.createdAt)}
                </div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {roots.map((item) => (
                    <div key={item.id}>
                      <div style={{ fontWeight: item.kind === "subassembly" ? 700 : 400 }}>{itemLabel(item)}</div>
                      <div className="cell-sub">
                        {item.steps
                          .filter((s) => s.active)
                          .map((s) => `${s.stepLabel}${s.completed ? " ✓" : ""}`)
                          .join(" · ") || "Aucune étape active"}
                      </div>
                      {(childrenByParent.get(item.id) ?? []).map((child) => (
                        <div key={child.id} style={{ marginLeft: 20, marginTop: 4 }}>
                          <div>{itemLabel(child)}</div>
                          <div className="cell-sub">
                            {child.steps
                              .filter((s) => s.active)
                              .map((s) => `${s.stepLabel}${s.completed ? " ✓" : ""}`)
                              .join(" · ") || "Aucune étape active"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
