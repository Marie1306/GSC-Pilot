import { useQuery } from "@tanstack/react-query";
import { canManageSeao } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { formatCalendarDate } from "../../lib/date.js";
import { fetchSeaoFiles, SEAO_STATUS_LABELS } from "./api.js";

interface SeaoListProps {
  onOpen: (id: string) => void;
  onCreate: () => void;
}

function badgeClassFor(status: string): string {
  if (status === "gagne") return "badge-conforme";
  if (status === "perdu") return "badge-critical";
  return "badge-neutral";
}

/** Liste des dossiers SEAO (16 septembre 2026) — même patron que ExternalSaleList.tsx. */
export function SeaoList({ onOpen, onCreate }: SeaoListProps) {
  const { employee } = useAuth();
  const listQuery = useQuery({ queryKey: ["seao-files"], queryFn: fetchSeaoFiles });
  const rows = listQuery.data?.seaoFiles ?? [];

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <h3>SEAO — Appels d'offres</h3>
        {employee && canManageSeao(employee.persona) && (
          <button type="button" className="btn" onClick={onCreate}>
            + Nouveau dossier
          </button>
        )}
      </div>
      {rows.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun dossier SEAO.</p>}
      {rows.length > 0 && (
        <div className="project-card-grid">
          {rows.map((row) => (
            <div key={row.id} className="project-card" onClick={() => onOpen(row.id)}>
              <div className="project-card-header">
                <span className="project-card-number">{row.displayId}</span>
                <span className={`badge-pill ${badgeClassFor(row.status)}`}>{SEAO_STATUS_LABELS[row.status] ?? row.status}</span>
              </div>
              <div className="project-card-name">{row.company ?? row.contactName}</div>
              <div className="project-card-sub">{row.title ?? "—"}</div>

              <div className="project-card-stats">
                <div className="stat-tile">
                  <span className="stat-tile-label">Échéance</span>
                  <span className="stat-tile-value">{row.submissionDeadline ? formatCalendarDate(row.submissionDeadline) : "—"}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Documents</span>
                  <span className="stat-tile-value">{row.hasDocuments ? "Déposés" : "Aucun"}</span>
                </div>
              </div>

              <div className="project-card-footer">
                <span />
                <span className="project-card-open">Ouvrir ›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
