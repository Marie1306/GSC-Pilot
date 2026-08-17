import { useQuery } from "@tanstack/react-query";
import { fetchProjects, STATUS_LABELS, FINANCIAL_STATUS_LABELS } from "./api.js";

interface ProjectListProps {
  onOpen: (id: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
}

export function ProjectList({ onOpen }: ProjectListProps) {
  const listQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const rows = listQuery.data?.projects ?? [];

  return (
    <div style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 16 }}>Projets</h2>
      {rows.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun projet pour l'instant.</p>}
      {rows.length > 0 && (
        <div className="project-card-grid">
          {rows.map((row) => (
            <div key={row.id} className="project-card" onClick={() => onOpen(row.id)}>
              <div className="project-card-header">
                <span className="project-card-number">{row.projectNumber}</span>
                {row.financialStatus && (
                  <span className={`badge-pill badge-${row.financialStatus}`}>{FINANCIAL_STATUS_LABELS[row.financialStatus]}</span>
                )}
              </div>
              <div className="project-card-name">{row.name}</div>
              <div className="project-card-sub">
                {row.company ?? row.contactName}
                {row.deadline && <> · Échéance {formatDate(row.deadline)}</>}
              </div>

              <div className="project-card-stats">
                <div className="stat-tile">
                  <span className="stat-tile-label">Avancement</span>
                  <span className="stat-tile-value">{row.progressionPct !== undefined ? `${row.progressionPct} %` : "—"}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Heures réelles</span>
                  <span className="stat-tile-value">{row.hoursUsedPct} %</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Marge réelle</span>
                  <span className="stat-tile-value">{row.grossMarginPct !== undefined ? `${row.grossMarginPct} %` : "—"}</span>
                </div>
              </div>

              {row.progressionPct !== undefined && (
                <div style={{ marginBottom: 14 }}>
                  <div className="progress-row">
                    <span style={{ color: "var(--gsc-color-muted)" }}>Progression du projet</span>
                    <strong>{row.progressionPct} %</strong>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, row.progressionPct))}%` }} />
                  </div>
                </div>
              )}

              <div className="project-card-footer">
                <span>{STATUS_LABELS[row.status] ?? row.status}</span>
                <span className="project-card-open">Ouvrir ›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
