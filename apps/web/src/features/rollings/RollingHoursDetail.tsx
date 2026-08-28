import { useQuery } from "@tanstack/react-query";
import { fetchApprovedRollingTimeEntries, formatCurrency } from "./api.js";

interface RollingHoursDetailProps {
  rolling: { id: string; label: string };
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * "Consulter les heures" du menu Options d'un roulement (28 août 2026) —
 * même mécanisme exact que ProjectHoursDetail.tsx/ApprovedHoursDrilldown.tsx,
 * adapté à rollingId. Pas de second appelant (Post-mortem du roulement
 * n'affiche pas ce détail, contrairement au projet) — inline plutôt qu'un
 * composant partagé séparé, pour rester proportionné au besoin.
 */
export function RollingHoursDetail({ rolling, onClose }: RollingHoursDetailProps) {
  const query = useQuery({ queryKey: ["approved-hours", "rolling", rolling.id], queryFn: () => fetchApprovedRollingTimeEntries(rolling.id) });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Heures approuvées</h2>
            <p className="modal-subtitle">{rolling.label}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div style={{ overflowX: "auto" }}>
            {query.isLoading && <p style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Chargement…</p>}
            {query.data && query.data.entries.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Aucune heure approuvée.</p>
            )}
            {query.data && query.data.entries.length > 0 && (
              <table className="shortlist-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Employé</th>
                    <th>Catégorie</th>
                    <th>Tâche</th>
                    <th className="num">Heures</th>
                    {query.data.entries[0]?.cost !== undefined && <th className="num">Coût</th>}
                  </tr>
                </thead>
                <tbody>
                  {query.data.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.date)}</td>
                      <td>{entry.employeeName}</td>
                      <td>{entry.category}</td>
                      <td>{entry.taskLabel}</td>
                      <td className="num">{entry.hours} h</td>
                      {entry.cost !== undefined && <td className="num">{formatCurrency(entry.cost)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
