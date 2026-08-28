import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { canDeleteErrorReport } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchErrorReportsByEmployee, formatCurrency } from "./api.js";
import { ErrorReportForm } from "./ErrorReportForm.js";
import { ErrorReportEmployeeDetail } from "./ErrorReportEmployeeDetail.js";

const MONTH_LABELS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

/**
 * Rapport d'erreurs (28 août 2026, nouveau module demandé par
 * l'utilisatrice) — nav réservée à canAccessErrorReports (Propriétaire/
 * Direction), même palier pour voir et créer (un seul groupe nommé,
 * contrairement à d'autres modules où voir/créer diffèrent) : pas de
 * vérification de rôle supplémentaire dans cette page, le serveur et la nav
 * suffisent déjà.
 *
 * « Diviser par employé » (spec confirmée) : la page liste les employés
 * ayant au moins un rapport pour la période filtrée, avec leurs totaux —
 * ouvrir une ligne affiche le détail de tous ses rapports
 * (ErrorReportEmployeeDetail.tsx).
 */
export function ErrorReportsPage() {
  const { employee } = useAuth();
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [year, setYear] = useState<number | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);
  const [openEmployeeId, setOpenEmployeeId] = useState<string | null>(null);

  const byEmployeeQuery = useQuery({
    queryKey: ["error-reports", "by-employee", month, year],
    queryFn: () => fetchErrorReportsByEmployee({ month, year }),
  });
  const summaries = byEmployeeQuery.data?.summaries ?? [];
  const availableYears = byEmployeeQuery.data?.availableYears ?? [];
  const openEmployee = summaries.find((row) => row.employeeId === openEmployeeId);

  if (!employee) return null;
  const canDelete = canDeleteErrorReport(employee.persona);

  return (
    <div>
      <div className="card">
        <div className="card-band-header">
          <div>
            <h3>Rapports d'erreurs</h3>
            <p className="modal-subtitle">Groupé par employé — ouvrez une ligne pour voir le détail de ses rapports.</p>
          </div>
          <button type="button" className="btn btn-small" onClick={() => setShowCreate(true)}>
            + Nouveau rapport d'erreur
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <select
            value={month ?? ""}
            onChange={(event) => setMonth(event.target.value ? Number(event.target.value) : undefined)}
            style={{ maxWidth: 170 }}
          >
            <option value="">Tous les mois</option>
            {MONTH_LABELS.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
          <select value={year ?? ""} onChange={(event) => setYear(event.target.value ? Number(event.target.value) : undefined)} style={{ maxWidth: 130 }}>
            <option value="">Toutes les années</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {byEmployeeQuery.isError && <p className="form-error">Impossible de charger les rapports d'erreurs.</p>}
        {summaries.length === 0 ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun rapport d'erreur pour cette période.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Employé</th>
                  <th className="num">Rapports</th>
                  <th className="num">Valeur matériel</th>
                  <th className="num">Heures perdues</th>
                  <th className="num">Valeur des heures</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((row) => (
                  <tr key={row.employeeId}>
                    <td>{row.employeeName}</td>
                    <td className="num">{row.reportCount}</td>
                    <td className="num">{formatCurrency(row.totalMaterialValue)}</td>
                    <td className="num">{row.totalHoursLost} h</td>
                    <td className="num">{formatCurrency(row.totalHoursValue)}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpenEmployeeId(row.employeeId)}>
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && <ErrorReportForm onClose={() => setShowCreate(false)} />}
      {openEmployeeId && openEmployee && (
        <ErrorReportEmployeeDetail
          employeeId={openEmployeeId}
          employeeName={openEmployee.employeeName}
          filters={{ month, year }}
          canDelete={canDelete}
          onClose={() => setOpenEmployeeId(null)}
        />
      )}
    </div>
  );
}
