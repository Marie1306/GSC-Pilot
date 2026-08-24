import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageProject, canArchiveProject, canDeleteProject } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { OptionsDrawer, OptionRow, OptionSection } from "../../components/OptionsDrawer.js";
import { updateProjectInfo, setProjectArchived, deleteProject, fetchProjectHistory, type ProjectDetail } from "./api.js";
import { ProjectPostMortem } from "./ProjectPostMortem.js";
import { ProjectChecklistArchive } from "../checklists/ProjectChecklistArchive.js";
import { ProjectQrCode } from "./ProjectQrCode.js";

interface ProjectOptionsMenuProps {
  project: ProjectDetail;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  /** Ferme le tiroir ET déclenche l'ouverture de la modale Avenant (ProjectAmendments, composant frère) — signal levé jusqu'à ProjectDetail. */
  onCreateAmendment: () => void;
  /** Même mécanisme pour la modale Achats réels (ProjectPurchaseEntries). */
  onAddPurchase: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Menu Options du projet (Projet 2F, 17 août 2026) — structure calquée sur
 * la référence v19, section par section. Les lignes dont le module cible
 * n'existe pas encore (punch d'heures, Appels de service, Contacts —
 * toujours des squelettes vides ailleurs dans l'appli) restent visibles
 * mais inertes plutôt que masquées, pour ne jamais donner l'impression d'un
 * menu incomplet. Code QR ouvre ProjectQrCode.tsx depuis le 23 août 2026.
 * Post-mortem (Projet 2E)
 * ouvre maintenant ProjectPostMortem.tsx — le comparatif main-d'oeuvre y
 * reste au niveau catégorie en attendant la spécification du détail par
 * sous-tâche. Garantie reste une section toujours visible sur la page
 * plutôt que cachée ici (déjà construite ainsi en 2D) — écart par rapport à
 * la liste v19 confirmé avec l'utilisatrice le 17 août 2026 (« Je préfère
 * sur la vue projet comme tu l'as mis »), pas juste une supposition.
 *
 * Tiroir latéral droit depuis le 18 août 2026 (remplace la carte inline
 * d'origine, jugée peu efficace car elle poussait tout le contenu de la
 * page projet vers le bas) — même référence v19, capture du tiroir fournie
 * par l'utilisatrice pour confirmer l'emplacement exact.
 */
export function ProjectOptionsMenu({ project, open, onClose, onDeleted, onCreateAmendment, onAddPurchase }: ProjectOptionsMenuProps) {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editForm, setEditForm] = useState(false);
  const [name, setName] = useState(project.name);
  const [deadline, setDeadline] = useState(project.deadline?.slice(0, 10) ?? "");
  const [showHistory, setShowHistory] = useState(false);
  const [showPostMortem, setShowPostMortem] = useState(false);
  const [showChecklistArchive, setShowChecklistArchive] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["project-history", project.id],
    queryFn: () => fetchProjectHistory(project.id),
    enabled: showHistory,
  });

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const updateMutation = useMutation({
    mutationFn: () => updateProjectInfo(project.id, { name: name.trim(), deadline: deadline || null }),
    onSuccess: () => {
      setEditForm(false);
      invalidate();
    },
    onError: onMutationError,
  });
  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) => setProjectArchived(project.id, archived),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: () => {
      invalidate();
      onDeleted();
    },
    onError: onMutationError,
  });

  if (!employee) return null;
  const canManage = canManageProject(employee.persona);
  const canArchive = canArchiveProject(employee.persona);
  const canDelete = canDeleteProject(employee.persona);
  const isArchived = !!project.archivedAt;

  return (
    <>
      {open && (
      <OptionsDrawer eyebrow="Options du projet" title={`${project.projectNumber} — ${project.name}`} onClose={onClose}>
        {error && <p className="form-error">{error}</p>}

        {editForm ? (
            <form
              className="form-grid"
              style={{ marginTop: 14 }}
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) updateMutation.mutate();
              }}
            >
              <div className="field">
                <label>Nom du projet</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Date d'échéance</label>
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
              <div className="field field-full" style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-small" disabled={!name.trim() || updateMutation.isPending}>
                  {updateMutation.isPending ? "…" : "Enregistrer"}
                </button>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditForm(false)}>
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <>
              {canManage && (
                <OptionSection title="Projet">
                  <OptionRow icon="✏️" label="Modifier les informations" onClick={() => setEditForm(true)} />
                </OptionSection>
              )}

              <OptionSection title="Planification et budget">
                {project.budgetId && (
                  <OptionRow icon="🧮" label="Accéder au Budgétaire" onClick={() => navigate(`/budgetaire?open=${project.budgetId}`)} />
                )}
                <OptionRow
                  icon="➕"
                  label="Créer un avenant"
                  onClick={() => {
                    onClose();
                    onCreateAmendment();
                  }}
                />
                <OptionRow icon="🕒" label="Historique du Budgétaire" disabled disabledNote="Hors de cette phase du module Projet." />
                <OptionRow icon="📐" label="Accéder au Gantt" onClick={() => navigate("/gantt")} />
                <OptionRow
                  icon="🔗"
                  label="Gérer les dépendances"
                  disabled
                  disabledNote="Générées automatiquement par les sous-assemblages — aucune édition manuelle pour l'instant."
                />
                <OptionRow
                  icon="✅"
                  label="Checklist de production"
                  onClick={() => {
                    onClose();
                    setShowChecklistArchive(true);
                  }}
                />
              </OptionSection>

              <OptionSection title="Heures et opérations">
                <OptionRow icon="🕒" label="Ajouter une entrée manuelle" disabled disabledNote="Module Punch d'heures pas encore construit." />
                <OptionRow
                  icon="🛒"
                  label="Ajouter un achat"
                  onClick={() => {
                    onClose();
                    onAddPurchase();
                  }}
                />
                <OptionRow icon="📞" label="Créer un call lié" disabled disabledNote="Module Appels de service pas encore construit." />
                <OptionRow icon="🕒" label="Consulter les heures" disabled disabledNote="Module Punch d'heures pas encore construit." />
              </OptionSection>

              <OptionSection title="Documents et suivi">
                <OptionRow
                  icon="⬜"
                  label="Code QR"
                  onClick={() => {
                    onClose();
                    setShowQrCode(true);
                  }}
                />
                <OptionRow
                  icon="📄"
                  label="Post-mortem"
                  onClick={() => {
                    onClose();
                    setShowPostMortem(true);
                  }}
                />
                <OptionRow icon="🕒" label={showHistory ? "Masquer l'historique" : "Historique complet"} onClick={() => setShowHistory((v) => !v)} />
              </OptionSection>

              {showHistory && (
                <div style={{ marginTop: 4, marginBottom: 12, overflowX: "auto" }}>
                  {historyQuery.isLoading && <p style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Chargement…</p>}
                  {historyQuery.data && historyQuery.data.events.length === 0 && (
                    <p style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Aucun événement.</p>
                  )}
                  {historyQuery.data && historyQuery.data.events.length > 0 && (
                    <table className="shortlist-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Événement</th>
                          <th>Par</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyQuery.data.events.map((event, index) => (
                          <tr key={index}>
                            <td>{formatDateTime(event.at)}</td>
                            <td>{event.label}</td>
                            <td>{event.actorName ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {project.clientRequestId && (
                <OptionSection title="Demande client d'origine">
                  <OptionRow icon="📞" label="Accéder à la demande" onClick={() => navigate(`/demandes?open=${project.clientRequestId}`)} />
                  <OptionRow icon="👤" label="Accéder au contact" disabled disabledNote="Module Contacts pas encore construit (page vide)." />
                </OptionSection>
              )}
            </>
          )}

          {(canArchive || canDelete) && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--gsc-color-line)" }}>
              <p style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--gsc-color-muted)" }}>
                Actions sensibles
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {canArchive && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={archiveMutation.isPending}
                    onClick={() => archiveMutation.mutate(!isArchived)}
                  >
                    {isArchived ? "Désarchiver le projet" : "Archiver le projet"}
                  </button>
                )}
                {canDelete &&
                  !project.deletedAt &&
                  (!confirmDelete ? (
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDelete(true)}>
                      Supprimer le projet
                    </button>
                  ) : (
                    <>
                      <span style={{ fontSize: 13, alignSelf: "center" }}>Envoyer à la corbeille — confirmer ?</span>
                      <button type="button" className="btn btn-small" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                        {deleteMutation.isPending ? "…" : "Confirmer la suppression"}
                      </button>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDelete(false)}>
                        Annuler
                      </button>
                    </>
                  ))}
              </div>
              {isArchived && (
                <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--gsc-color-muted)" }}>
                  Projet archivé le {formatDateTime(project.archivedAt!)} — reste accessible ici, seulement sorti des listes actives.
                </p>
              )}
            </div>
          )}
      </OptionsDrawer>
      )}

      {showPostMortem && <ProjectPostMortem projectId={project.id} onClose={() => setShowPostMortem(false)} />}
      {showChecklistArchive && <ProjectChecklistArchive projectId={project.id} onClose={() => setShowChecklistArchive(false)} />}
      {showQrCode && <ProjectQrCode project={{ projectNumber: project.projectNumber, name: project.name }} onClose={() => setShowQrCode(false)} />}
    </>
  );
}
