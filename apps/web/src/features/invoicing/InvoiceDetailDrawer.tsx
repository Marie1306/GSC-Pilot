import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canCreateInvoiceRecord, canRecordPayment, canHoldInvoice } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { OptionsDrawer } from "../../components/OptionsDrawer.js";
import {
  fetchInvoiceEntries,
  recordInvoice,
  recordInvoicePayment,
  holdInvoiceEntry,
  releaseInvoiceHold,
  formatCurrency,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_BADGE,
  type InvoiceEntryDto,
} from "./api.js";

interface InvoiceDetailDrawerProps {
  id: string;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

/**
 * Fenêtre contextuelle "Enregistrer un paiement reçu" (31 août 2026, demande
 * explicite de l'utilisatrice après comparaison avec v19) — le champ ne
 * prend QUE le montant de ce nouveau versement (jamais un défaut, jamais le
 * cumulatif à ressaisir : recordInvoicePayment additionne côté serveur, voir
 * projects/service.ts). Le solde affiché en sous-titre est celui de
 * `entry`, toujours celui reçu au moment de l'ouverture — jamais mémorisé
 * localement entre deux ouvertures.
 */
function RecordPaymentModal({ entry, onClose, onSuccess }: { entry: InvoiceEntryDto; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const balance = entry.amount - entry.paidAmount;

  const mutation = useMutation({
    mutationFn: (value: number) => recordInvoicePayment(entry.id, value),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!(value > 0)) return;
    mutation.mutate(value);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Enregistrer un paiement reçu</h2>
            <p className="modal-subtitle">
              {entry.invoiceNumber} · solde {formatCurrency(balance)}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
            <div className="field field-full">
              <label htmlFor="payment-amount">Montant reçu ($)</label>
              <input
                id="payment-amount"
                type="number"
                min={0.01}
                step="0.01"
                autoFocus
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-footer">
            <button type="submit" className="btn" disabled={!(Number(amount) > 0) || mutation.isPending}>
              {mutation.isPending ? "…" : "Confirmer le paiement"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Tiroir latéral droit de détail d'une facture (31 août 2026, demande
 * explicite de l'utilisatrice, inspirée de la mise en page v19 — tuiles +
 * échéancier, jamais son mécanisme de paiement cumulatif, corrigé ici).
 * Remplace l'ancien accordéon en ligne d'InvoicingPage.tsx : cliquer une
 * ligne ouvre ce tiroir plutôt que de déplier un formulaire sous la ligne.
 */
export function InvoiceDetailDrawer({ id, onClose }: InvoiceDetailDrawerProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["invoicing", "entries"], queryFn: fetchInvoiceEntries });
  const entry = listQuery.data?.entries.find((e) => e.id === id);
  const [invoiceNumberDraft, setInvoiceNumberDraft] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["invoicing", "entries"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const recordMutation = useMutation({
    mutationFn: () => recordInvoice(id, { invoiceNumber: invoiceNumberDraft.trim(), dueDate: dueDateDraft || undefined }),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const holdMutation = useMutation({ mutationFn: () => holdInvoiceEntry(id), onSuccess: invalidate, onError: onMutationError });
  const releaseMutation = useMutation({ mutationFn: () => releaseInvoiceHold(id), onSuccess: invalidate, onError: onMutationError });

  if (!employee) return null;

  if (!entry) {
    return (
      <OptionsDrawer eyebrow="Facturation" title={listQuery.isLoading ? "Chargement…" : "Introuvable"} onClose={onClose}>
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>
          {listQuery.isLoading ? "Chargement…" : "Cette facture n'existe plus."}
        </p>
      </OptionsDrawer>
    );
  }

  const canRecord = canCreateInvoiceRecord(employee.persona);
  const canPay = canRecordPayment(employee.persona);
  const canHold = canHoldInvoice(employee.persona);
  const balance = entry.amount - entry.paidAmount;
  const isFullyPaid = balance <= 0.005;
  const isOnHold = entry.status === "on_hold";

  return (
    <OptionsDrawer eyebrow="Facturation" title={entry.invoiceNumber ?? entry.sourceLabel} onClose={onClose}>
      <p className="modal-subtitle" style={{ marginTop: -8, marginBottom: 16 }}>
        {entry.clientLabel} · {entry.sourceLabel}
      </p>
      {error && <p className="form-error">{error}</p>}

      <div className="stat-tile-grid" style={{ marginBottom: 20 }}>
        <div className="stat-tile">
          <span className="stat-tile-label">Montant</span>
          <span className="stat-tile-value">{formatCurrency(entry.amount)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">Payé</span>
          <span className="stat-tile-value">{formatCurrency(entry.paidAmount)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">Solde</span>
          <span className="stat-tile-value">{formatCurrency(balance)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">Statut</span>
          <span className={`badge-pill ${INVOICE_STATUS_BADGE[entry.status]}`}>{INVOICE_STATUS_LABELS[entry.status]}</span>
        </div>
      </div>

      {!entry.invoiceNumber ? (
        canRecord && (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              if (!invoiceNumberDraft.trim()) return;
              recordMutation.mutate();
            }}
          >
            <div className="field">
              <label htmlFor="inv-number">Numéro de facture</label>
              <input id="inv-number" value={invoiceNumberDraft} onChange={(event) => setInvoiceNumberDraft(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="inv-due">Échéance (facultatif)</label>
              <input id="inv-due" type="date" value={dueDateDraft} onChange={(event) => setDueDateDraft(event.target.value)} />
            </div>
            <div className="field field-full">
              <button type="submit" className="btn btn-small" disabled={!invoiceNumberDraft.trim() || recordMutation.isPending}>
                {recordMutation.isPending ? "…" : "✓ Enregistrer"}
              </button>
            </div>
          </form>
        )
      ) : (
        <>
          <p style={{ margin: "0 0 8px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--gsc-color-muted)" }}>
            Échéancier
          </p>
          <div className="action-item-list" style={{ marginBottom: 20 }}>
            <div className="action-item-row" style={{ cursor: "default" }}>
              <div className="action-item-main">
                <span className="action-item-label">✉️ Facture envoyée</span>
              </div>
              <span className="action-item-date">{formatDate(entry.processedAt)}</span>
            </div>
            {entry.dueDate && (
              <div className="action-item-row" style={{ cursor: "default" }}>
                <div className="action-item-main">
                  <span className="action-item-label">📅 Date d'échéance</span>
                </div>
                <span className="action-item-date">{formatDate(entry.dueDate)}</span>
              </div>
            )}
            {entry.paidAt && (
              <div className="action-item-row" style={{ cursor: "default" }}>
                <div className="action-item-main">
                  <span className="action-item-label">✓ Paiement reçu</span>
                  <span className="action-item-sublabel">{formatCurrency(entry.paidAmount)} au total</span>
                </div>
                <span className="action-item-date">{formatDate(entry.paidAt)}</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canHold &&
              !isFullyPaid &&
              (isOnHold ? (
                <button type="button" className="btn btn-secondary" disabled={releaseMutation.isPending} onClick={() => releaseMutation.mutate()}>
                  {releaseMutation.isPending ? "…" : "Retirer la suspension"}
                </button>
              ) : (
                <button type="button" className="btn btn-secondary" disabled={holdMutation.isPending} onClick={() => holdMutation.mutate()}>
                  {holdMutation.isPending ? "…" : "Mettre en suspens"}
                </button>
              ))}
            {canPay && !isFullyPaid && (
              <button type="button" className="btn" onClick={() => setPayOpen(true)}>
                Paiement reçu
              </button>
            )}
          </div>
        </>
      )}

      {payOpen && <RecordPaymentModal entry={entry} onClose={() => setPayOpen(false)} onSuccess={invalidate} />}
    </OptionsDrawer>
  );
}
