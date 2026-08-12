import { useQuery } from "@tanstack/react-query";
import { fetchProjects, formatCurrency, STATUS_LABELS } from "./api.js";

interface ProjectListProps {
  onOpen: (id: string) => void;
}

export function ProjectList({ onOpen }: ProjectListProps) {
  const listQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const rows = listQuery.data?.projects ?? [];

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Projets</h2>
      {rows.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun projet pour l'instant.</p>}
      {rows.length > 0 && (
        <table className="shortlist-table">
          <thead>
            <tr>
              <th>Projet</th>
              <th>Client / contact</th>
              <th>Statut</th>
              <th className="num">Prix vendu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="clickable-row" onClick={() => onOpen(row.id)}>
                <td>
                  <div>{row.projectNumber}</div>
                  <div className="cell-sub">{row.name}</div>
                </td>
                <td>
                  <div>{row.company ?? row.contactName}</div>
                  <div className="cell-sub">{row.contactName}</div>
                </td>
                <td>{STATUS_LABELS[row.status] ?? row.status}</td>
                <td className="num">{formatCurrency(row.sold)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
