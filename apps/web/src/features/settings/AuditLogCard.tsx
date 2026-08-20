import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuditLog } from "./api.js";
import "./settings.css";

const ACTION_LABELS: Record<string, string> = {
  permission_denied: "Accès refusé",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Historique des modifications structurantes (AuditLogEntry) — lecture seule, Direction seulement. */
export function AuditLogCard() {
  const [open, setOpen] = useState(false);
  const logQuery = useQuery({ queryKey: ["audit-log"], queryFn: fetchAuditLog, enabled: open });
  const entries = logQuery.data?.entries ?? [];

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Journal d'audit</h2>
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -8 }}>Historique des modifications structurantes.</p>
        </div>
      </div>

      <button type="button" className="btn btn-secondary" onClick={() => setOpen((current) => !current)}>
        {open ? "Fermer le journal" : "Ouvrir le journal d'audit"}
      </button>

      {open && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          {logQuery.isLoading ? (
            <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>
          ) : entries.length === 0 ? (
            <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune entrée pour l'instant.</p>
          ) : (
            <table className="audit-log-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Qui</th>
                  <th>Action</th>
                  <th>Concerne</th>
                  <th>Détail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.at)}</td>
                    <td>{entry.actorName}</td>
                    <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                    <td>
                      {entry.entityType} — {entry.entityId}
                    </td>
                    <td>{entry.justification ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
