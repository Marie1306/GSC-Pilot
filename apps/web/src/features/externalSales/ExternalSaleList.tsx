import { useQuery } from "@tanstack/react-query";
import { canManageExternalSales } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { formatCalendarDate } from "../../lib/date.js";
import { fetchExternalSales, formatCurrency, EXTERNAL_SALE_STATUS_LABELS } from "./api.js";

interface ExternalSaleListProps {
  onOpen: (id: string) => void;
  onCreate: () => void;
}

/** Liste des ventes externes (8 septembre 2026) — pas d'onglets de cycle de vie (contrairement à Projet) : une vente reste courte et n'a que 2 statuts (voir EXTERNAL_SALE_STATUS_LABELS). */
export function ExternalSaleList({ onOpen, onCreate }: ExternalSaleListProps) {
  const { employee } = useAuth();
  const listQuery = useQuery({ queryKey: ["external-sales"], queryFn: fetchExternalSales });
  const rows = listQuery.data?.externalSales ?? [];

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <h3>Ventes externes</h3>
        {employee && canManageExternalSales(employee.persona) && (
          <button type="button" className="btn" onClick={onCreate}>
            + Nouvelle vente
          </button>
        )}
      </div>
      {rows.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune vente externe.</p>}
      {rows.length > 0 && (
        <div className="project-card-grid">
          {rows.map((row) => (
            <div key={row.id} className="project-card" onClick={() => onOpen(row.id)}>
              <div className="project-card-header">
                <span className="project-card-number">{row.displayId}</span>
                <span className={`badge-pill ${row.status === "ready_invoice" ? "badge-conforme" : "badge-neutral"}`}>
                  {EXTERNAL_SALE_STATUS_LABELS[row.status] ?? row.status}
                </span>
              </div>
              <div className="project-card-name">{row.company ?? row.contactName}</div>
              <div className="project-card-sub">{formatCalendarDate(row.createdAt)}</div>

              <div className="project-card-stats">
                <div className="stat-tile">
                  <span className="stat-tile-label">Prix vendu</span>
                  <span className="stat-tile-value">{formatCurrency(row.salePrice)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Livraison</span>
                  <span className="stat-tile-value">{row.readyToDeliver ? "Prête" : "En attente"}</span>
                </div>
              </div>

              <div className="project-card-footer">
                <span />
                <span className="project-card-open">Ouvrir ›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
