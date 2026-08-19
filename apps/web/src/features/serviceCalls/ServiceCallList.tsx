import { useQuery } from "@tanstack/react-query";
import { canCreateServiceCall } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchServiceCalls } from "./api.js";
import "./serviceCalls.css";

interface ServiceCallListProps {
  onOpen: (id: string) => void;
  onCreate: () => void;
}

const STATUS_LABELS: Record<string, string> = { scheduled: "Planifié", approved: "Approuvé" };

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) : "—";
}

export function ServiceCallList({ onOpen, onCreate }: ServiceCallListProps) {
  const { employee } = useAuth();
  const listQuery = useQuery({ queryKey: ["service-calls"], queryFn: fetchServiceCalls });
  const rows = listQuery.data?.serviceCalls ?? [];
  const canCreate = employee ? canCreateServiceCall(employee.persona) : false;

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginTop: 0, fontSize: 20 }}>Appels de service</h1>
          <p style={{ color: "var(--gsc-color-muted)", margin: 0 }}>
            Résumé obligatoire → signature client → approbation Direction → envoi à l'administration.
          </p>
        </div>
        {canCreate && (
          <button type="button" className="btn" onClick={onCreate}>
            + Nouvel appel
          </button>
        )}
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="service-call-table">
            <thead>
              <tr>
                <th>Call</th>
                <th>Client</th>
                <th>Demande</th>
                <th>Assigné à</th>
                <th>Prévu</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--gsc-color-muted)" }}>
                    Aucun appel de service pour l'instant.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} onClick={() => onOpen(row.id)} style={{ cursor: "pointer" }}>
                  <td>{row.displayId}</td>
                  <td>{row.company ?? row.contactName}</td>
                  <td>{row.request}</td>
                  <td>{row.assignedEmployees.length > 0 ? row.assignedEmployees.map((employee) => employee.name).join(", ") : "—"}</td>
                  <td>{formatDate(row.scheduledAt)}</td>
                  <td>
                    <span className={`badge-pill ${row.status === "approved" ? "badge-conforme" : "badge-neutral"}`}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
