import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canCreateInvoiceRecord, canRecordPayment } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { OptionsDrawer } from "../../components/OptionsDrawer.js";
import { fetchInvoiceEntries, recordInvoice, recordInvoicePayment, formatCurrency } from "./api.js";

interface InvoiceActionDrawerProps {
  id: string;
  onClose: () => void;
}

/**
 * Détail + actions d'une facture à traiter, ouvert depuis le Centre
 * d'actions (25 août 2026) — même requête de liste et mêmes mutations
 * qu'InvoicingPage (Demander/Enregistrer/Paiement déjà vérifiées), jamais
 * une deuxième logique de facturation en parallèle.
 */
export function InvoiceActionDrawer({ id, onClose }: InvoiceActionDrawerProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["invoicing", "entries"], queryFn: fetchInvoiceEntries });
  const entry = listQuery.data?.entries.find((e) => e.id === id);
  const [invoiceNumberDraft, setInvoiceNumberDraft] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [paidAmountDraft, setPaidAmountDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["invoicing", "entries"] });
    void queryClient.invalidateQueries({ queryKey: ["action-center"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const recordMutation = useMutation({
    mutationFn: () => recordInvoice(id, { invoiceNumber: invoiceNumberDraft.trim(), dueDate: dueDateDraft || undefined }),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const paymentMutation = useMutation({
    mutationFn: (paidAmount: number) => recordInvoicePayment(id, paidAmount),
    onSuccess: invalidate,
    onError: onMutationError,
  });

  if (!employee) return null;

  if (!entry) {
    return (
      <OptionsDrawer eyebrow="Facturation" title={listQuery.isLoading ? "Chargement…" : "Introuvable"} onClose={onClose}>
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>
          {listQuery.isLoading ? "Chargement…" : "Cette facture n'attend plus de traitement."}
        </p>
      </OptionsDrawer>
    );
  }

  const canRecord = canCreateInvoiceRecord(employee.persona);
  const canPay = canRecordPayment(employee.persona);

  return (
    <OptionsDrawer eyebrow="Facturation à traiter" title={`${entry.sourceLabel} — ${entry.label}`} onClose={onClose}>
      {error && <p className="form-error">{error}</p>}
      <p style={{ fontSize: 13, lineHeight: 1.7 }}>
        Client : {entry.clientLabel}
        <br />
        Montant : {formatCurrency(entry.amount)}
        <br />
        Payé : {formatCurrency(entry.paidAmount)}
      </p>

      {canRecord && !entry.invoiceNumber && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
          <div className="field">
            <label>Numéro de facture</label>
            <input value={invoiceNumberDraft} onChange={(event) => setInvoiceNumberDraft(event.target.value)} />
          </div>
          <div className="field">
            <label>Échéance (facultatif)</label>
            <input type="date" value={dueDateDraft} onChange={(event) => setDueDateDraft(event.target.value)} />
          </div>
          <button
            type="button"
            className="btn"
            disabled={!invoiceNumberDraft.trim() || recordMutation.isPending}
            onClick={() => recordMutation.mutate()}
          >
            {recordMutation.isPending ? "…" : "✓ Enregistrer"}
          </button>
        </div>
      )}

      {canPay && entry.invoiceNumber && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="field">
            <label>Montant payé à ce jour ($)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={paidAmountDraft || (entry.paidAmount ? String(entry.paidAmount) : "")}
              onChange={(event) => setPaidAmountDraft(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={paymentMutation.isPending}
            onClick={() => {
              const value = Number(paidAmountDraft);
              if (value >= 0) paymentMutation.mutate(value);
            }}
          >
            {paymentMutation.isPending ? "…" : "✓ Enregistrer le paiement"}
          </button>
        </div>
      )}
    </OptionsDrawer>
  );
}
