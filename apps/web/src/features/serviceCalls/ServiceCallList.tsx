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
      <section className="card">
        <div className="card-band-header">
          <h3>Appels de service</h3>
          {canCreate && (
            <button type="button" className="btn" onClick={onCreate}>
              + Nouvel appel
            </button>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="service-call-table">
            <thead>
              <tr>
                <th>Call</th>
                <th>Client</th>
                <th>Titre</th>
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
                  <td>{row.title}</td>
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
