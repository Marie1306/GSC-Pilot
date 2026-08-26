import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { canManageProductionChecklist } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchProjects } from "../projects/api.js";
import { createChecklist, fetchProjectsWithActiveChecklists, type ChecklistDto } from "./api.js";
import { ChecklistEntryModal } from "./ChecklistEntryModal.js";
import { ChecklistProjectView } from "./ChecklistProjectView.js";
import "./checklist.css";

/**
 * Checklist de production (21 août 2026, spec confirmée, puis navigation
 * revue par projet le même jour — « Nous travaillons par projet, donc la
 * checklist doit être par projet également ») : grille de projets ayant au
 * moins une checklist active → checklists de ce projet (une par
 * assemblage) → pièces de la checklist choisie, filtre étape/épaisseur
 * scopé à cette checklist (jamais transversal). Le bouton de création
 * reste ici (confirmé : « le bouton peut rester où il est ») — en
 * sélectionnant le projet, la checklist se crée directement dedans, puis
 * on atterrit directement sur sa vue filtrée après l'entrée rapide.
 */
export function ChecklistPage() {
  const { employee } = useAuth();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newProjectId, setNewProjectId] = useState("");
  const [newAssemblyLabel, setNewAssemblyLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeChecklist, setActiveChecklist] = useState<ChecklistDto | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects, enabled: showNewForm });
  const activeProjectsQuery = useQuery({
    queryKey: ["checklist", "active-projects"],
    queryFn: fetchProjectsWithActiveChecklists,
    enabled: !selectedProjectId,
  });

  const createMutation = useMutation({
    mutationFn: () => createChecklist(newProjectId, newAssemblyLabel.trim() || undefined),
    onSuccess: ({ checklist }) => {
      setShowNewForm(false);
      setNewProjectId("");
      setNewAssemblyLabel("");
      setError(null);
      setActiveChecklist(checklist);
      setSelectedProjectId(checklist.projectId);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  if (!employee) return null;
  const canManage = canManageProductionChecklist(employee.persona);
  const canCreate = newProjectId.length > 0 && !createMutation.isPending;
  const activeProjects = activeProjectsQuery.data?.projects ?? [];

  return (
    <div>
      <div className="card">
        {!selectedProjectId ? (
          <>
            <div className="card-band-header">
              <h3>Projets</h3>
              {canManage && !showNewForm && (
                <button type="button" className="btn btn-small" onClick={() => setShowNewForm(true)}>
                  + Nouvelle checklist
                </button>
              )}
            </div>

            {showNewForm && (
              <form
                className="form-grid"
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
            {error && <p className="form-error" style={{ marginTop: 14 }}>{error}</p>}

            {activeProjectsQuery.isLoading && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: 14 }}>Chargement…</p>}
            {activeProjectsQuery.isSuccess && activeProjects.length === 0 && (
              <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: 14 }}>Aucun projet avec une checklist active pour l'instant.</p>
            )}
            {activeProjects.length > 0 && (
              <div className="project-card-grid" style={{ marginTop: 14 }}>
                {activeProjects.map((project) => (
                  <div key={project.projectId} className="project-card" onClick={() => setSelectedProjectId(project.projectId)}>
                    <div className="project-card-header">
                      <span className="project-card-number">{project.projectNumber}</span>
                    </div>
                    <div className="project-card-name">{project.projectName}</div>
                    <div className="project-card-footer">
                      <span>
                        {project.activeChecklistCount} checklist{project.activeChecklistCount > 1 ? "s" : ""} active
                        {project.activeChecklistCount > 1 ? "s" : ""}
                      </span>
                      <span className="project-card-open">Ouvrir ›</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <ChecklistProjectView
            key={selectedProjectId}
            projectId={selectedProjectId}
            initialChecklistId={activeChecklist?.id ?? null}
            onBack={() => setSelectedProjectId(null)}
          />
        )}
      </div>

      {activeChecklist && <ChecklistEntryModal checklist={activeChecklist} onClose={() => setActiveChecklist(null)} />}
    </div>
  );
}
