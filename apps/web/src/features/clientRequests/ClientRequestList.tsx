import { useQuery } from "@tanstack/react-query";
import { fetchClientRequests, REQUEST_TYPE_LABELS, URGENCY_LABELS, STATUS_LABELS, type ClientRequestListItem } from "./api.js";

interface ClientRequestListProps {
  onOpen: (id: string) => void;
  onCreate: () => void;
  canCreate: boolean;
}

function typeLabel(request: ClientRequestListItem): string {
  return REQUEST_TYPE_LABELS[request.requestType as keyof typeof REQUEST_TYPE_LABELS] ?? request.requestType;
}

function urgencyLabel(request: ClientRequestListItem): string {
  return request.urgency ? (URGENCY_LABELS[request.urgency as keyof typeof URGENCY_LABELS] ?? request.urgency) : "—";
}

export function ClientRequestList({ onOpen, onCreate, canCreate }: ClientRequestListProps) {
  const listQuery = useQuery({ queryKey: ["client-requests"], queryFn: fetchClientRequests });
  const rows = listQuery.data?.clientRequests ?? [];

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <h3>Demandes clients</h3>
        {canCreate && (
          <button type="button" className="btn" onClick={onCreate}>
            + Nouvelle demande client
          </button>
        )}
      </div>
      {rows.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune demande pour l'instant.</p>}
      {rows.length > 0 && (
        <div className="table-scroll">
        <table className="shortlist-table">
          <thead>
            <tr>
              <th>Demande</th>
              <th>Client / contact</th>
              <th>Type / urgence</th>
              <th>Canal</th>
              <th>Statut</th>
              <th>Créée par</th>
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
                <td>
                  <div>{typeLabel(row)}</div>
                  <div className="cell-sub">{urgencyLabel(row)}</div>
                </td>
                <td>{row.channelName ?? "—"}</td>
                <td>{STATUS_LABELS[row.status] ?? row.status}</td>
                <td>{row.createdByName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
