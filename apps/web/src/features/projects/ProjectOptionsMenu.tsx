import { useState } from "react";
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

/**
 * Menu Options du projet (Projet 2F, 17 août 2026) — scope confirmé par
 * capture d'écran (voir CLAUDE.md) : modifier infos/renommer/échéance,
 * historique complet, archiver, supprimer (corbeille, mécanisme seulement —
 * l'écran de restauration 90 jours attend le module Paramètres). Gantt,
 * avenants, punch d'heures, Code QR et « Créer un call lié » (module Appels
 * de service pas encore construit) restent hors de cette phase.
 */
export function ProjectOptionsMenu({ project, open, onClose, onDeleted }: ProjectOptionsMenuProps) {
  const { employee } = useAuth();
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

      {canManage && (
        <div style={{ marginTop: 14 }}>
          {!editForm ? (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditForm(true)}>
              Renommer / modifier l'échéance
            </button>
          ) : (
            <form
              className="form-grid"
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
          )}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? "Masquer l'historique" : "Historique complet"}
        </button>
        <button type="button" className="btn btn-secondary btn-small" disabled title="Module Appels de service à venir" style={{ marginLeft: 8 }}>
          Créer un call lié (bientôt)
        </button>
      </div>

      {showHistory && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
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
