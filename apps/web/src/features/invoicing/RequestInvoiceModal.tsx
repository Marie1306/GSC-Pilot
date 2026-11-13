import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { formatCurrency, type InvoiceRequestPreviewDto } from "../projects/api.js";

interface RequestInvoiceModalProps {
  subtitle: string;
  fetchPreview: () => Promise<{ preview: InvoiceRequestPreviewDto }>;
  confirm: (note?: string) => Promise<unknown>;
  onClose: () => void;
  onSuccess: () => void;
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Geste unifié "Demander la facturation" (13 novembre 2026, refonte) —
 * aperçu (numéro/%, taxes, échéance net-30) puis confirmation dans la même
 * fenêtre. Réutilisée par Project/Rolling/ServiceCall/ExternalSale, chacun
 * fournissant son propre fetchPreview/confirm (route différente selon que
 * le jalon existe déjà — voir ProjectInvoicePlan/RollingDetail — ou doit
 * être créé par le même geste — ServiceCallDetail/ExternalSaleDetail).
 * Remplace l'ancien bouton "Demander" + la saisie manuelle du numéro
 * (ex-"Enregistrer", InvoiceDetailDrawer.tsx) : numéro réel attribué
 * seulement à la confirmation, jamais avant.
 */
export function RequestInvoiceModal({ subtitle, fetchPreview, confirm, onClose, onSuccess }: RequestInvoiceModalProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const previewQuery = useQuery({ queryKey: ["invoice-request-preview", subtitle], queryFn: fetchPreview });

  const confirmMutation = useMutation({
    mutationFn: () => confirm(note.trim() || undefined),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  const preview = previewQuery.data?.preview;

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Demander la facturation</h2>
            <p className="modal-subtitle">{subtitle}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          {previewQuery.isLoading && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>}
          {previewQuery.isError && (
            <p className="form-error">
              {previewQuery.error instanceof ApiError ? previewQuery.error.message : "Impossible de calculer l'aperçu."}
            </p>
          )}
          {preview && (
            <>
              <div className="stat-tile-grid" style={{ marginBottom: 16 }}>
                <div className="stat-tile">
                  <span className="stat-tile-label">Numéro</span>
                  <span className="stat-tile-value">{preview.nextInvoiceNumber}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Avant taxes</span>
                  <span className="stat-tile-value">{formatCurrency(preview.amountBeforeTax)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">TPS</span>
                  <span className="stat-tile-value">{formatCurrency(preview.tpsAmount)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">TVQ</span>
                  <span className="stat-tile-value">{formatCurrency(preview.tvqAmount)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Total avec taxes</span>
                  <span className="stat-tile-value">{formatCurrency(preview.totalWithTax)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Échéance (net 30)</span>
                  <span className="stat-tile-value">{formatDueDate(preview.dueDate)}</span>
                </div>
              </div>
              <div className="field field-full">
                <label htmlFor="invoice-request-note">Note (facultatif)</label>
                <textarea id="invoice-request-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" disabled={!preview || confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
            {confirmMutation.isPending ? "…" : "Demander la facturation"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
