import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCalendarDate } from "../../lib/date.js";
import { ApiError } from "../../lib/apiClient.js";
import { STATUS_LABELS, FULFILLMENT_STATUS_LABELS, applyPurchaseRequestToExternalSale } from "../purchases/api.js";
import { fetchExternalSaleDetail, formatCurrency } from "./api.js";
import { ExternalSaleFulfillment } from "./ExternalSaleFulfillment.js";

interface ExternalSaleDetailProps {
  id: string;
  onClose: () => void;
}

/**
 * Détail d'une vente externe (8 septembre 2026) — tuiles financières, lignes
 * de pièces (= PurchaseRequest liées, jamais une table séparée, voir
 * externalSales/service.ts) avec bouton "Appliquer à la vente" par ligne
 * reçue, puis Livraison (ExternalSaleFulfillment.tsx). L'approbation/
 * commande/réception de chaque ligne se fait dans le module Achats existant
 * (PurchaseRequestList.tsx) — jamais dupliquée ici, voir le plan confirmé.
 */
export function ExternalSaleDetail({ id, onClose }: ExternalSaleDetailProps) {
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["external-sale", id], queryFn: () => fetchExternalSaleDetail(id) });
  const sale = detailQuery.data;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["external-sale", id] });
    void queryClient.invalidateQueries({ queryKey: ["external-sales"] });
  };
  const applyMutation = useMutation({
    mutationFn: applyPurchaseRequestToExternalSale,
    onSuccess: invalidate,
    onError: () => {
      /* affiché ligne par ligne via applyMutation.isError plus bas serait superflu ici — la ligne reste simplement inchangée, l'utilisatrice réessaie. */
    },
  });

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 780 }}>
        <div className="modal-header">
          <div>
            <h2>{sale ? `${sale.displayId} — ${sale.company ?? sale.contactName}` : "Vente externe"}</h2>
            {sale && <p className="modal-subtitle">{formatCalendarDate(sale.createdAt)}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!sale && <p>Chargement…</p>}
          {sale && (
            <>
              <div className="stat-tile-grid">
                <div className="stat-tile">
                  <span className="stat-tile-label">Coût des pièces</span>
                  <span className="stat-tile-value">{formatCurrency(sale.partsBaseCost)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Transport</span>
                  <span className="stat-tile-value">{formatCurrency(sale.transportFee)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Frais administratifs</span>
                  <span className="stat-tile-value">{formatCurrency(sale.adminFee)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Marge</span>
                  <span className="stat-tile-value">{sale.marginPct} %</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Prix vendu</span>
                  <span className="stat-tile-value">{formatCurrency(sale.salePrice)}</span>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, marginBottom: 4 }}>Pièces</h3>
                <p style={{ margin: "0 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
                  Chaque ligne est une demande d'achat — approbation, commande et réception se font dans Demandes d'achat.
                </p>
                <div className="table-scroll">
                  <table className="shortlist-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th className="num">Montant</th>
                        <th>Statut</th>
                        <th>Réception</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sale.lines.map((line) => {
                        const canApply = line.fulfillmentStatus === "received" && !line.appliedToExternalSaleAt;
                        return (
                          <tr key={line.id}>
                            <td>
                              {line.description}
                              <div className="cell-sub">{line.displayId}</div>
                            </td>
                            <td className="num">{line.amount != null ? formatCurrency(line.amount) : "—"}</td>
                            <td>{STATUS_LABELS[line.status] ?? line.status}</td>
                            <td>
                              {line.appliedToExternalSaleAt
                                ? `Appliquée le ${formatCalendarDate(line.appliedToExternalSaleAt)}`
                                : (line.fulfillmentStatus && (FULFILLMENT_STATUS_LABELS[line.fulfillmentStatus] ?? line.fulfillmentStatus)) || "—"}
                            </td>
                            <td>
                              {canApply && (
                                <button type="button" className="btn btn-small" disabled={applyMutation.isPending} onClick={() => applyMutation.mutate(line.id)}>
                                  Appliquer à la vente
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {applyMutation.isError && (
                  <p className="form-error">{applyMutation.error instanceof ApiError ? applyMutation.error.message : "Erreur — réessayez."}</p>
                )}
              </div>

              <ExternalSaleFulfillment sale={sale} />
            </>
          )}
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
