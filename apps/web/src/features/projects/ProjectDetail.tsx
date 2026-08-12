import { useQuery } from "@tanstack/react-query";
import { fetchProjectDetail, formatCurrency, STATUS_LABELS } from "./api.js";

interface ProjectDetailProps {
  id: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Coup d'œil seulement (Phase 1, 12 août 2026, confirmé par capture d'écran
 * réelle de la vue projet v19) — le détail plus bas dans la vraie vue
 * (table de comparaison planifié/réel par catégorie, Gantt, achats/heures
 * réels) vient dans une prochaine phase, son contenu exact restant à
 * confirmer avec l'utilisatrice avant de le construire.
 */
export function ProjectDetail({ id, onClose }: ProjectDetailProps) {
  const detailQuery = useQuery({ queryKey: ["project", id], queryFn: () => fetchProjectDetail(id) });
  const project = detailQuery.data?.project;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{project ? `${project.projectNumber} — ${project.name}` : "Projet"}</h2>
            {project && (
              <p className="modal-subtitle">
                {project.company ?? project.contactName} · {formatDate(project.createdAt)}
                {project.budgetDisplayId && <> · Budgétaire d'origine : {project.budgetDisplayId}</>}
              </p>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!project && <p>Chargement…</p>}
          {project && (
            <>
              <div className="status-row">
                <span className="detail-label">Statut</span>
                <div>{STATUS_LABELS[project.status] ?? project.status}</div>
              </div>

              <div className="detail-grid">
                <div>
                  <span className="detail-label">Prix vendu</span>
                  <span>{formatCurrency(project.sold)}</span>
                </div>
                <div>
                  <span className="detail-label">Heures planifiées</span>
                  <span>{project.plannedHours} h</span>
                </div>
                <div>
                  <span className="detail-label">Heures réelles</span>
                  <span>{project.actualHours} h</span>
                </div>
                <div>
                  <span className="detail-label">Utilisation heures</span>
                  <span>{project.hoursUsedPct} %</span>
                </div>
                <div>
                  <span className="detail-label">Achats prévus</span>
                  <span>{formatCurrency(project.plannedPurchases)}</span>
                </div>
                <div>
                  <span className="detail-label">Achats réels</span>
                  <span>{formatCurrency(project.actualPurchases)}</span>
                </div>
                <div>
                  <span className="detail-label">Back-up heures</span>
                  <span>
                    {project.backupHours} h · {formatCurrency(project.backupHoursCost)}
                  </span>
                </div>
                <div>
                  <span className="detail-label">Back-up projet</span>
                  <span>{formatCurrency(project.projectBackupAmount)}</span>
                </div>
                <div>
                  <span className="detail-label">Marge brute réelle</span>
                  <span>{formatCurrency(project.grossMargin)}</span>
                </div>
                <div>
                  <span className="detail-label">Marge brute %</span>
                  <span>{project.grossMarginPct} %</span>
                </div>
                <div>
                  <span className="detail-label">Marge visée</span>
                  <span>{project.targetMarginPct !== null ? `${project.targetMarginPct} %` : "—"}</span>
                </div>
              </div>
            </>
          )}
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
