import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { formatCurrency } from "../projects/api.js";
import { RequestInvoiceModal } from "../invoicing/RequestInvoiceModal.js";
import { fetchInvoiceableBonsDeTravail, previewServiceCallInvoiceForSelection, createServiceCallInvoiceForSelection } from "./api.js";
import "./serviceCalls.css";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

interface SelectBonsDeTravailModalProps {
  serviceCallId: string;
  serviceCallDisplayId: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Sélection des Bons de travail à facturer (Chantier D Partie 3, 16
 * novembre 2026) — Marie choisit, parmi les BT approuvés pas encore
 * facturés de ce Call, lesquels mettre sur une même facture (jamais
 * automatique — plusieurs factures distinctes peuvent exister pour un même
 * Call au fil du temps). Une fois "Continuer" cliqué, ouvre
 * RequestInvoiceModal EXISTANTE telle quelle (fetchPreview/confirm fermés
 * sur la sélection figée à ce moment).
 */
export function SelectBonsDeTravailModal({ serviceCallId, serviceCallDisplayId, onClose, onSuccess }: SelectBonsDeTravailModalProps) {
  const listQuery = useQuery({
    queryKey: ["service-call", serviceCallId, "invoiceable-bons-travail"],
    queryFn: () => fetchInvoiceableBonsDeTravail(serviceCallId),
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  const bonsDeTravail = listQuery.data?.bonsDeTravail ?? [];
  const selectedTotal = bonsDeTravail.filter((bt) => selectedIds.includes(bt.id)).reduce((sum, bt) => sum + bt.amount, 0);

  function toggle(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((i) => i !== id) : [...current, id]));
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Sélectionner les Bons de travail à facturer</h2>
            <p className="modal-subtitle">{serviceCallDisplayId} — choisissez lesquels vont sur cette facture.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          {listQuery.isLoading && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>}
          {listQuery.isError && (
            <p className="form-error">{listQuery.error instanceof ApiError ? listQuery.error.message : "Impossible de charger les Bons de travail."}</p>
          )}
          {!listQuery.isLoading && bonsDeTravail.length === 0 && (
            <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun Bon de travail approuvé en attente de facturation pour l'instant.</p>
          )}
          {bonsDeTravail.length > 0 && (
            <div className="bon-de-travail-selection-list">
              {bonsDeTravail.map((bt) => (
                <label key={bt.id}>
                  <span>
                    <input type="checkbox" checked={selectedIds.includes(bt.id)} onChange={() => toggle(bt.id)} />
                    {bt.displayId} — {formatDate(bt.scheduledAt)}
                  </span>
                  <strong>{formatCurrency(bt.amount)}</strong>
                </label>
              ))}
            </div>
          )}
          {selectedIds.length > 0 && (
            <div className="stat-tile-grid" style={{ marginTop: 16 }}>
              <div className="stat-tile">
                <span className="stat-tile-label">Total sélectionné</span>
                <span className="stat-tile-value">{formatCurrency(selectedTotal)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" disabled={selectedIds.length === 0} onClick={() => setRequestModalOpen(true)}>
            Continuer
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
      {requestModalOpen && (
        <RequestInvoiceModal
          subtitle={`${serviceCallDisplayId} — ${selectedIds.length} bon${selectedIds.length > 1 ? "s" : ""} de travail`}
          fetchPreview={() => previewServiceCallInvoiceForSelection(serviceCallId, selectedIds)}
          confirm={(note) => createServiceCallInvoiceForSelection(serviceCallId, selectedIds, note)}
          onClose={() => setRequestModalOpen(false)}
          onSuccess={() => {
            onSuccess();
            onClose();
          }}
          allowLines={false}
        />
      )}
    </div>
  );
}
