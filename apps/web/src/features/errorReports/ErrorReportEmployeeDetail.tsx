import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchErrorReportsForEmployee, deleteErrorReport, formatCurrency, type ErrorReportFilters } from "./api.js";

interface ErrorReportEmployeeDetailProps {
  employeeId: string;
  employeeName: string;
  filters: ErrorReportFilters;
  canDelete: boolean;
  onClose: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Drill-down par employé (« ouvrir le détail de tous les rapports
 * d'erreurs », spec confirmée le 28 août 2026) — fichier séparé plutôt
 * qu'inline dans ErrorReportsPage.tsx pour la lisibilité, même granularité
 * que RollingHoursDetail.tsx (pas de deuxième appelant, jamais partagé).
 */
export function ErrorReportEmployeeDetail({ employeeId, employeeName, filters, canDelete, onClose }: ErrorReportEmployeeDetailProps) {
  const queryClient = useQueryClient();
  const reportsQuery = useQuery({
    queryKey: ["error-reports", "employee", employeeId, filters],
    queryFn: () => fetchErrorReportsForEmployee(employeeId, filters),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteErrorReport(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["error-reports"] }),
  });

  const reports = reportsQuery.data?.reports ?? [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Rapports d'erreurs — {employeeName}</h2>
            <p className="modal-subtitle">{reports.length} rapport(s) pour la période sélectionnée.</p>
          </div>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {reportsQuery.isLoading && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>}
          {reports.length === 0 && !reportsQuery.isLoading && (
            <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun rapport pour cette période.</p>
          )}
          {reports.map((report) => (
            <div key={report.id} className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <strong>{formatDateTime(report.createdAt)}</strong>
                  <div className="cell-sub">Rapporté par {report.createdByName}</div>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    className="icon-btn"
                    title="Supprimer"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(report.id)}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="stat-tile-grid" style={{ marginTop: 10 }}>
                <div className="stat-tile">
                  <span className="stat-tile-label">Valeur matériel</span>
                  <span className="stat-tile-value">{formatCurrency(report.materialValue)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Heures perdues</span>
                  <span className="stat-tile-value">{report.hoursLost} h</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Valeur des heures</span>
                  <span className="stat-tile-value">{formatCurrency(report.hoursValue)}</span>
                </div>
              </div>
              {report.note && <p style={{ margin: "10px 0 0", fontSize: 13 }}>{report.note}</p>}
              {report.photos.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {report.photos.map((photo) => (
                    <img key={photo.id} src={photo.imageDataUrl} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6 }} />
                  ))}
                </div>
              )}
            </div>
          ))}
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
