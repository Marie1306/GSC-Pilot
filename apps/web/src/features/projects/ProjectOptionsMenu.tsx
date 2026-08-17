import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageProject, canArchiveProject, canDeleteProject } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { updateProjectInfo, setProjectArchived, deleteProject, fetchProjectHistory, type ProjectDetail } from "./api.js";

interface ProjectOptionsMenuProps {
  project: ProjectDetail;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface OptionRowProps {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledNote?: string;
}

/** Une ligne du menu Options — même structure que la référence v19 (icône, libellé, chevron), qu'elle soit réelle ou en attente d'un module pas encore construit. */
function OptionRow({ icon, label, onClick, disabled, disabledNote }: OptionRowProps) {
  return (
    <button
      type="button"
      className="options-row"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? disabledNote : undefined}
    >
      <span className="options-row-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="options-row-label">
        {label}
        {disabled && <span className="options-row-soon"> (bientôt)</span>}
      </span>
      <span className="options-row-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function OptionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="options-section">
      <p className="options-section-title">{title}</p>
      {children}
    </div>
  );
}

/**
 * Menu Options du projet (Projet 2F, 17 août 2026) — structure et
 * emplacement/couleur du bouton déclencheur calqués sur la référence v19
 * telle quelle (confirmé le 17 août 2026), section par section. Les lignes
 * dont le module cible n'existe pas encore (Gantt, avenants, punch
 * d'heures, Code QR, Appels de service, Post-mortem, Contacts — toutes
 * confirmées comme des squelettes vides ailleurs dans l'appli) restent
 * visibles mais inertes plutôt que masquées, pour ne jamais donner
 * l'impression d'un menu incomplet. Garantie reste une section toujours
 * visible sur la page plutôt que cachée ici (déjà construite ainsi en 2D) —
 * écart par rapport à la liste v19 confirmé avec l'utilisatrice le 17 août
 * 2026 (« Je préfère sur la vue projet comme tu l'as mis »), pas juste une
 * supposition.
 */
export function ProjectOptionsMenu({ project, open, onClose, onDeleted }: ProjectOptionsMenuProps) {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editForm, setEditForm] = useState(false);
  const [name, setName] = useState(project.name);
  const [deadline, setDeadline] = useState(project.deadline?.slice(0, 10) ?? "");
  const [showHistory, setShowHistory] = useState(false);
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

  if (!open || !employee) return null;
  const canManage = canManageProject(employee.persona);
  const canArchive = canArchiveProject(employee.persona);
  const canDelete = canDeleteProject(employee.persona);
  const isArchived = !!project.archivedAt;

  return (
    <div className="card" style={{ marginBottom: 20, background: "var(--gsc-color-surface2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Options du projet</h3>
        <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
          Fermer les options
        </button>
      </div>

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
              <OptionRow icon="✏️" label="Renommer le projet" onClick={() => setEditForm(true)} />
              <OptionRow icon="📅" label="Modifier la date d'échéance" onClick={() => setEditForm(true)} />
            </OptionSection>
          )}

          <OptionSection title="Planification et budget">
            {project.budgetId && (
              <OptionRow icon="🧮" label="Accéder au Budgétaire" onClick={() => navigate(`/budgetaire?open=${project.budgetId}`)} />
            )}
            <OptionRow icon="➕" label="Créer un avenant" disabled disabledNote="Avenants — pas encore câblés à l'interface." />
            <OptionRow icon="🕒" label="Historique du Budgétaire" disabled disabledNote="Hors de cette phase du module Projet." />
            <OptionRow icon="📐" label="Accéder au Gantt" disabled disabledNote="Gantt — phase séparée, confirmé." />
            <OptionRow icon="🔗" label="Gérer les dépendances" disabled disabledNote="Gantt — phase séparée, confirmé." />
          </OptionSection>

          <OptionSection title="Heures et opérations">
            <OptionRow icon="🕒" label="Ajouter une entrée manuelle" disabled disabledNote="Module Punch d'heures pas encore construit." />
            <OptionRow icon="🛒" label="Ajouter un achat" onClick={onClose} />
            <OptionRow icon="📞" label="Créer un call lié" disabled disabledNote="Module Appels de service pas encore construit." />
            <OptionRow icon="🕒" label="Consulter les heures" disabled disabledNote="Module Punch d'heures pas encore construit." />
          </OptionSection>

          <OptionSection title="Documents et suivi">
            <OptionRow icon="⬜" label="Code QR" disabled disabledNote="Module Scan QR pas encore construit." />
            <OptionRow icon="📄" label="Post-mortem" disabled disabledNote="Contenu pas encore reçu — voir CLAUDE.md." />
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
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
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
    </div>
  );
}
