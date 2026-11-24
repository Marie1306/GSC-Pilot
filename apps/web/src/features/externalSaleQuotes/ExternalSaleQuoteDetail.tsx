import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { canManageExternalSales, externalSaleInvoiceLines } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { formatCalendarDate } from "../../lib/date.js";
import { ApiError } from "../../lib/apiClient.js";
import {
  fetchExternalSaleQuoteDetail,
  sendExternalSaleQuote,
  decideExternalSaleQuote,
  convertExternalSaleQuoteToSale,
  deleteExternalSaleQuote,
  formatCurrency,
  EXTERNAL_SALE_QUOTE_STATUS_LABELS,
} from "./api.js";

interface ExternalSaleQuoteDetailProps {
  id: string;
  onClose: () => void;
  onConverted: (saleId: string) => void;
}

/**
 * Détail d'une Soumission de Vente externe (23 novembre 2026) — statut +
 * actions selon le cycle brouillon→envoyée→acceptée/refusée→convertie,
 * même esprit que SoumissionCard.tsx mais en modal de détail plutôt qu'en
 * ligne de tableau sous un budgétaire (Vente externe n'a pas de parent de
 * ce genre). « Convertir en vente » appelle convertExternalSaleQuoteToSale
 * — crée la vraie ExternalSale (VE-AAAA-NNNN) + ses PurchaseRequest,
 * seulement disponible une fois acceptée.
 */
export function ExternalSaleQuoteDetail({ id, onClose, onConverted }: ExternalSaleQuoteDetailProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["external-sale-quote", id], queryFn: () => fetchExternalSaleQuoteDetail(id) });
  const quote = detailQuery.data;
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["external-sale-quote", id] });
    void queryClient.invalidateQueries({ queryKey: ["external-sale-quotes"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const sendMutation = useMutation({
    mutationFn: () => sendExternalSaleQuote(id),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: onMutationError,
  });
  const decideMutation = useMutation({
    mutationFn: (outcome: "accepted" | "declined") => decideExternalSaleQuote(id, outcome),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: onMutationError,
  });
  const convertMutation = useMutation({
    mutationFn: () => convertExternalSaleQuoteToSale(id),
    onSuccess: ({ id: saleId }) => {
      setError(null);
      invalidate();
      onConverted(saleId);
    },
    onError: onMutationError,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteExternalSaleQuote(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["external-sale-quotes"] });
      onClose();
    },
    onError: onMutationError,
  });

  const canManage = !!employee && canManageExternalSales(employee.persona);

  if (!quote) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="modal-body">{detailQuery.isError ? "Soumission introuvable." : "Chargement…"}</div>
        </div>
      </div>
    );
  }

  const badgeClass = quote.status === "accepted" ? "badge-conforme" : quote.status === "declined" ? "badge-critical" : "badge-neutral";

  // Lignes affichées au PRIX (jamais le coût interne, voir unitCost sur
  // quote.lines) — même calcul exact que la ventilation de Facture
  // (externalSaleInvoiceLines, déjà construite le 17 novembre 2026) :
  // marge réappliquée par pièce + frais administratifs divisés par le
  // nombre d'unités vendues, transport en ligne séparée. La Soumission
  // devient ainsi un aperçu fidèle de ce que montrera la Facture.
  const invoiceLines = externalSaleInvoiceLines(
    quote.lines.map((line) => ({ description: line.description, qty: line.qty, unitCost: line.unitCost })),
    quote.transportFee,
    quote.adminFee,
    quote.marginPct,
  );

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <div>
            <h2>
              {quote.displayId} — {quote.company ?? quote.contactName}
            </h2>
            <p className="modal-subtitle">
              {formatCalendarDate(quote.createdAt)} · <span className={`badge-pill ${badgeClass}`}>{EXTERNAL_SALE_QUOTE_STATUS_LABELS[quote.status]}</span>
            </p>
            {quote.convertedSaleDisplayId && (
              <p style={{ margin: "4px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>Convertie en vente {quote.convertedSaleDisplayId}</p>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}

          <div className="stat-tile-grid">
            <div className="stat-tile">
              <span className="stat-tile-label">Coût des pièces</span>
              <span className="stat-tile-value">{quote.partsBaseCost != null ? formatCurrency(quote.partsBaseCost) : "—"}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Prix vendu</span>
              <span className="stat-tile-value">{quote.salePrice != null ? formatCurrency(quote.salePrice) : "—"}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Total avec taxes</span>
              <span className="stat-tile-value">{quote.totalWithTax != null ? formatCurrency(quote.totalWithTax) : "—"}</span>
            </div>
          </div>

          <div className="table-scroll" style={{ marginTop: 16 }}>
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Qté</th>
                  <th className="num">Prix unitaire</th>
                  <th className="num">Montant</th>
                </tr>
              </thead>
              <tbody>
                {invoiceLines.map((line, index) => (
                  <tr key={index}>
                    <td>{line.description}</td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{formatCurrency(line.unitPrice)}</td>
                    <td className="num">{formatCurrency(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-footer">
          {canManage && quote.status === "draft" && (
            <button type="button" className="btn btn-secondary" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate()}>
              {sendMutation.isPending ? "…" : "Envoyer"}
            </button>
          )}
          {canManage && quote.status === "sent" && (
            <>
              <button type="button" className="btn btn-secondary" disabled={decideMutation.isPending} onClick={() => decideMutation.mutate("accepted")}>
                Marquer acceptée
              </button>
              <button type="button" className="btn btn-secondary" disabled={decideMutation.isPending} onClick={() => decideMutation.mutate("declined")}>
                Marquer refusée
              </button>
            </>
          )}
          {canManage && quote.status === "accepted" && !quote.convertedSaleId && (
            <button type="button" className="btn" disabled={convertMutation.isPending} onClick={() => convertMutation.mutate()}>
              {convertMutation.isPending ? "…" : "Convertir en vente"}
            </button>
          )}
          {quote.sentAt && (
            <button type="button" className="btn btn-secondary" onClick={() => window.open(`/external-sale-quotes/${id}/export`, "_blank", "noopener")}>
              Imprimer
            </button>
          )}
          {canManage && !quote.convertedSaleId && (
            <>
              {!confirmDelete ? (
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(true)}>
                  Supprimer
                </button>
              ) : (
                <>
                  <span style={{ fontSize: 13 }}>Confirmer la suppression ?</span>
                  <button type="button" className="btn" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                    Confirmer
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
                    Annuler
                  </button>
                </>
              )}
            </>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
