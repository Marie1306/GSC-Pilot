import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { canManageExternalSales, canConfirmInvoiceRequest, canPurgeDossier } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { formatCalendarDate } from "../../lib/date.js";
import { ApiError } from "../../lib/apiClient.js";
import { STATUS_LABELS, FULFILLMENT_STATUS_LABELS, applyPurchaseRequestToExternalSale } from "../purchases/api.js";
import { RequestInvoiceModal } from "../invoicing/RequestInvoiceModal.js";
import { ExternalSaleDocuments } from "./ExternalSaleDocuments.js";
import {
  fetchExternalSaleDetail,
  formatCurrency,
  setExternalSaleCompleted,
  previewExternalSaleInvoice,
  requestExternalSaleInvoice,
  purgeExternalSale,
  EXTERNAL_SALE_STATUS_LABELS,
} from "./api.js";
import { ExternalSaleFulfillment } from "./ExternalSaleFulfillment.js";
import { ExternalSaleEditForm } from "./ExternalSaleEditForm.js";
import { PurgeConfirmModal } from "../../components/PurgeConfirmModal.js";
import { convertExternalSaleQuoteToConfirmation } from "../externalSaleConfirmations/api.js";

interface ExternalSaleDetailProps {
  id: string;
  onClose: () => void;
}

/** invoiceRequestedAt est un vrai timestamp (posé par requestExternalSaleInvoice), jamais une des 5 colonnes date-calendrier bogue connu — formatCalendarDate ne s'applique pas ici, voir lib/date.ts. */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Détail d'une vente externe (8 septembre 2026) — tuiles financières, lignes
 * de pièces (= PurchaseRequest liées, jamais une table séparée, voir
 * externalSales/service.ts) avec bouton "Appliquer à la vente" par ligne
 * reçue, puis Livraison (ExternalSaleFulfillment.tsx). L'approbation/
 * commande/réception de chaque ligne se fait dans le module Achats existant
 * (PurchaseRequestList.tsx) — jamais dupliquée ici, voir le plan confirmé.
 *
 * « Convertir en confirmation de commande » (25 novembre 2026) — 2e point
 * d'entrée vers la même action que ExternalSaleQuoteDetail.tsx (nécessaire
 * : une fois la soumission convertie en vente, elle quitte la liste
 * "Soumissions" et son détail interactif n'est plus accessible autrement
 * que par ici). `sale.quoteId` null (vente créée directement, jamais de
 * soumission) → bouton absent, aucun moyen de générer une confirmation.
 */
export function ExternalSaleDetail({ id, onClose }: ExternalSaleDetailProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["external-sale", id], queryFn: () => fetchExternalSaleDetail(id) });
  const sale = detailQuery.data;
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showConvertToConfirmation, setShowConvertToConfirmation] = useState(false);
  const [clientPoNumber, setClientPoNumber] = useState("");
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["external-sale", id] });
    void queryClient.invalidateQueries({ queryKey: ["external-sales"] });
  };
  // Accessible aussi depuis l'écran de la vente (25 novembre 2026, rapporté
  // par Marie — VE-2026-0008) : une fois une soumission convertie en vente,
  // elle quitte la liste "Soumissions" (24 novembre) et son détail
  // interactif devient impossible à rouvrir depuis l'interface — le lien
  // Documents n'ouvre que l'export PDF. Reprend exactement la même logique
  // que ExternalSaleQuoteDetail.tsx (indépendante, n'importe quel ordre),
  // juste un 2e point d'entrée vers la même action.
  const convertToConfirmationMutation = useMutation({
    mutationFn: () => convertExternalSaleQuoteToConfirmation(sale!.quoteId!, { clientPoNumber: clientPoNumber.trim() || undefined }),
    onSuccess: () => {
      setConfirmationError(null);
      setShowConvertToConfirmation(false);
      setClientPoNumber("");
      invalidate();
    },
    onError: (err: unknown) => setConfirmationError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });
  const applyMutation = useMutation({
    mutationFn: applyPurchaseRequestToExternalSale,
    onSuccess: invalidate,
    onError: () => {
      /* affiché ligne par ligne via applyMutation.isError plus bas serait superflu ici — la ligne reste simplement inchangée, l'utilisatrice réessaie. */
    },
  });
  const completedMutation = useMutation({
    mutationFn: (completed: boolean) => setExternalSaleCompleted(id, completed),
    onSuccess: invalidate,
  });
  const canManage = !!employee && canManageExternalSales(employee.persona);
  const canRequestInvoiceForSale = !!employee && canConfirmInvoiceRequest(employee.persona);
  const canPurge = !!employee && canPurgeDossier(employee.persona);
  const isCompleted = sale?.status === "ready_invoice";

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 780 }}>
        <div className="modal-header">
          <div>
            <h2>{sale ? `${sale.displayId} — ${sale.company ?? sale.contactName}` : "Vente externe"}</h2>
            {sale && (
              <>
                <p className="modal-subtitle">
                  {formatCalendarDate(sale.createdAt)}
                  {" · "}
                  <span className={`badge-pill ${isCompleted ? "badge-conforme" : "badge-neutral"}`}>
                    {EXTERNAL_SALE_STATUS_LABELS[sale.status] ?? sale.status}
                  </span>
                </p>
                {sale.invoiceRequestedAt && (
                  <p style={{ margin: "4px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>
                    Facturation demandée le {formatDateTime(sale.invoiceRequestedAt)}
                  </p>
                )}
                {sale.confirmationId && (
                  <p style={{ margin: "4px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>
                    Confirmation de commande {sale.confirmationDisplayId}
                  </p>
                )}
              </>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!sale && <p>Chargement…</p>}
          {sale && (
            <>
              {confirmationError && <p className="form-error">{confirmationError}</p>}
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
              <ExternalSaleDocuments
                externalSaleId={id}
                quoteId={sale.quoteId}
                quoteDisplayId={sale.quoteDisplayId}
                confirmationId={sale.confirmationId}
                confirmationDisplayId={sale.confirmationDisplayId}
                invoiceEntryId={sale.invoiceEntryId}
                invoiceNumber={sale.invoiceNumber}
              />
            </>
          )}
        </div>

        <div className="modal-footer">
          {sale && canManage && !sale.invoiceRequestedAt && (
            <button type="button" className="btn btn-secondary" onClick={() => setShowEditForm(true)}>
              Modifier
            </button>
          )}
          {sale && canManage && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={completedMutation.isPending}
              onClick={() => completedMutation.mutate(!isCompleted)}
            >
              {isCompleted ? "Réactiver la vente" : "Terminer la vente"}
            </button>
          )}
          {sale && isCompleted && canRequestInvoiceForSale && !sale.invoiceRequestedAt && (
            <button type="button" className="btn btn-secondary" onClick={() => setRequestModalOpen(true)}>
              Demander la facturation
            </button>
          )}
          {sale && canManage && sale.quoteId && !sale.confirmationId && (
            <>
              {!showConvertToConfirmation ? (
                <button type="button" className="btn btn-secondary" onClick={() => setShowConvertToConfirmation(true)}>
                  Convertir en confirmation de commande
                </button>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="No de bon de commande du client (facultatif)"
                    value={clientPoNumber}
                    onChange={(e) => setClientPoNumber(e.target.value)}
                    style={{ width: 220 }}
                  />
                  <button type="button" className="btn" disabled={convertToConfirmationMutation.isPending} onClick={() => convertToConfirmationMutation.mutate()}>
                    {convertToConfirmationMutation.isPending ? "…" : "Confirmer la conversion"}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowConvertToConfirmation(false)}>
                    Annuler
                  </button>
                </>
              )}
            </>
          )}
          {sale && sale.confirmationId && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => window.open(`/external-sale-confirmations/${sale.confirmationId}/export`, "_blank", "noopener")}
            >
              Imprimer la confirmation
            </button>
          )}
          {sale && canPurge && (
            <button type="button" className="btn btn-secondary" onClick={() => setShowPurgeConfirm(true)}>
              Supprimer définitivement
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
      {showEditForm && sale && <ExternalSaleEditForm sale={sale} onClose={() => setShowEditForm(false)} />}
      {showPurgeConfirm && sale && (
        <PurgeConfirmModal
          title={`Supprimer définitivement la vente ${sale.displayId}`}
          displayId={sale.displayId}
          warningItems={["Les demandes d'achat de pièces liées", "La Facture (même déjà envoyée)", "Les documents téléversés", "La livraison"]}
          onConfirm={() => purgeExternalSale(id)}
          onClose={() => setShowPurgeConfirm(false)}
          onSuccess={onClose}
        />
      )}
      {requestModalOpen && sale && (
        <RequestInvoiceModal
          subtitle={sale.displayId}
          fetchPreview={() => previewExternalSaleInvoice(id)}
          confirm={(note, lines) => requestExternalSaleInvoice(id, note, lines)}
          onClose={() => setRequestModalOpen(false)}
          allowLines
          onSuccess={invalidate}
        />
      )}
    </div>
  );
}
