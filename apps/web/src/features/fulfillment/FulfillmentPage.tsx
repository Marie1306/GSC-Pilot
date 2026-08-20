import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDeliveries } from "./api.js";
import { DeliveryDetail } from "./DeliveryDetail.js";
import "./fulfillment.css";

const STATUS_LABELS: Record<string, string> = { planned: "Planifiée", completed: "Complétée" };

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) : "—";
}

/**
 * Livraisons (20 août 2026) — les Bons de livraison sont créés
 * automatiquement quand Direction/Administration choisit le mode "Bon de
 * livraison" sur un projet (voir ProjectFulfillment.tsx) — cet écran est
 * la file du magasinier qui doit les confirmer (canAccessDeliveries : le
 * Magasinier ne voit que ses livraisons assignées, le reste de l'équipe
 * voit tout).
 */
export function FulfillmentPage() {
  const deliveriesQuery = useQuery({ queryKey: ["deliveries"], queryFn: fetchDeliveries });
  const [openId, setOpenId] = useState<string | null>(null);
  const deliveries = deliveriesQuery.data?.deliveries ?? [];

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginTop: 0, fontSize: 20 }}>Livraisons</h1>
          <p style={{ color: "var(--gsc-color-muted)", margin: 0 }}>
            Bons de livraison créés depuis les projets — confirmation par le magasinier qui livre.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        {deliveriesQuery.isError ? (
          <p className="form-error">Impossible de charger les livraisons.</p>
        ) : deliveries.length === 0 ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune livraison pour l'instant.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Bon</th>
                  <th>Client / dossier</th>
                  <th>Adresse</th>
                  <th>Prévue</th>
                  <th>Magasinier</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>{delivery.displayId}</td>
                    <td>
                      <div>{delivery.company ?? delivery.contactName}</div>
                      <div className="cell-sub">{delivery.sourceLabel}</div>
                    </td>
                    <td>{delivery.address ?? "—"}</td>
                    <td>{formatDate(delivery.scheduledAt)}</td>
                    <td>{delivery.driverEmployeeName ?? "Non assigné"}</td>
                    <td>
                      <span className={`badge-pill ${delivery.status === "completed" ? "badge-conforme" : "badge-neutral"}`}>
                        {STATUS_LABELS[delivery.status] ?? delivery.status}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpenId(delivery.id)}>
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

      {openId && <DeliveryDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
