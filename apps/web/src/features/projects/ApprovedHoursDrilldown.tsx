import { useQuery } from "@tanstack/react-query";
import { fetchApprovedTimeEntries, formatCurrency } from "./api.js";

interface ApprovedHoursDrilldownProps {
  projectId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Détail des heures approuvées — même source que le Comparatif planifié vs
 * réel (getApprovedTimeEntries, projects/service.ts). Partagé entre le
 * Post-mortem (repliable derrière son propre bouton) et "Consulter les
 * heures" du menu Options d'un projet actif (27 août 2026, ProjectHoursDetail) —
 * volontairement sans bascule interne : chaque appelant contrôle déjà
 * si/quand ce composant est monté (état showHoursDrilldown au Post-mortem,
 * fermeture de la modale dans le menu Options).
 */
export function ApprovedHoursDrilldown({ projectId }: ApprovedHoursDrilldownProps) {
  const query = useQuery({ queryKey: ["approved-hours", projectId], queryFn: () => fetchApprovedTimeEntries(projectId) });

  return (
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
  );
}
