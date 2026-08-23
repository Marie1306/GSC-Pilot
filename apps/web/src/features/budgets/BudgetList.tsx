import { useQuery } from "@tanstack/react-query";
import { fetchBudgets, formatCurrency, STATUS_LABELS } from "./api.js";

interface BudgetListProps {
  onOpen: (id: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

export function BudgetList({ onOpen }: BudgetListProps) {
  const listQuery = useQuery({ queryKey: ["budgets"], queryFn: fetchBudgets });
  const rows = listQuery.data?.budgets ?? [];

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Budgétaires</h2>
      {rows.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun budgétaire pour l'instant.</p>}
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="shortlist-table">
            <thead>
              <tr>
                <th>Budgétaire</th>
                <th>Client / contact</th>
                <th>Statut</th>
                <th>Créé par</th>
                <th>Date</th>
                <th className="num">Prix de vente</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="clickable-row" onClick={() => onOpen(row.id)}>
                  <td>{row.displayId}</td>
                  <td>
                    <div>{row.company ?? row.contactName}</div>
                    <div className="cell-sub">{row.contactName}</div>
                  </td>
                  <td>{STATUS_LABELS[row.status] ?? row.status}</td>
                  <td>{row.createdByName}</td>
                  <td>{formatDate(row.createdAt)}</td>
                  <td className="num">{formatCurrency(row.totalSale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
