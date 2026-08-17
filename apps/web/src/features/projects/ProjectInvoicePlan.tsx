import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canRequestInvoice, canCreateInvoiceRecord, canRecordPayment } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import {
  fetchInvoicePlan,
  requestInvoice,
  recordInvoice,
  recordInvoicePayment,
  formatCurrency,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_BADGE,
  type InvoicePlanEntryDto,
} from "./api.js";

interface ProjectInvoicePlanProps {
  projectId: string;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

type ExpandedAction = { id: string; type: "record" | "payment" } | null;

/**
 * Cycle de facturation (Projet 2C, 17 août 2026) : les 4 jalons sont créés
 * une seule fois à la conversion (DEFAULT_BILLING_SPLIT, billing.ts) —
 * modifier la répartition après coup reste hors de cette phase (voir
 * CLAUDE.md). Sage reste la source réelle des factures — ceci n'est qu'un
 * suivi manuel, "Enregistrer" ne requiert jamais un "Demander" préalable.
 */
export function ProjectInvoicePlan({ projectId }: ProjectInvoicePlanProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const planQuery = useQuery({ queryKey: ["invoice-plan", projectId], queryFn: () => fetchInvoicePlan(projectId) });
  const [expanded, setExpanded] = useState<ExpandedAction>(null);
  const [invoiceNumberDraft, setInvoiceNumberDraft] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [paidAmountDraft, setPaidAmountDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    setExpanded(null);
    void queryClient.invalidateQueries({ queryKey: ["invoice-plan", projectId] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const requestMutation = useMutation({ mutationFn: requestInvoice, onSuccess: invalidate, onError: onMutationError });
  const recordMutation = useMutation({
    mutationFn: ({ id, invoiceNumber, dueDate }: { id: string; invoiceNumber: string; dueDate?: string }) =>
      recordInvoice(id, { invoiceNumber, dueDate }),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const paymentMutation = useMutation({
    mutationFn: ({ id, paidAmount }: { id: string; paidAmount: number }) => recordInvoicePayment(id, paidAmount),
    onSuccess: invalidate,
    onError: onMutationError,
  });

  if (!employee) return null;
  const canRequest = canRequestInvoice(employee.persona);
  const canRecord = canCreateInvoiceRecord(employee.persona);
  const canPay = canRecordPayment(employee.persona);
  const entries = planQuery.data?.entries ?? [];
  if (entries.length === 0) return null;

  function openRecord(entry: InvoicePlanEntryDto) {
    setExpanded({ id: entry.id, type: "record" });
    setInvoiceNumberDraft(entry.invoiceNumber ?? "");
    setDueDateDraft(entry.dueDate?.slice(0, 10) ?? "");
  }
  function openPayment(entry: InvoicePlanEntryDto) {
    setExpanded({ id: entry.id, type: "payment" });
    setPaidAmountDraft(entry.paidAmount ? String(entry.paidAmount) : "");
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Cycle de facturation</h3>
      <p style={{ margin: "0 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>Suivi manuel — Sage reste la source réelle des factures.</p>
      {error && <p className="form-error">{error}</p>}
      <div style={{ overflowX: "auto" }}>
        <table className="shortlist-table">
          <thead>
            <tr>
              <th>Jalon</th>
              <th className="num">%</th>
              <th className="num">Montant</th>
              <th>Statut</th>
              <th>Facture</th>
              <th>Échéance</th>
              <th className="num">Payé</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <Fragment key={entry.id}>
                <tr>
                  <td>
                    {entry.label}
                    {entry.isExtra && <div className="cell-sub">Extra</div>}
                  </td>
                  <td className="num">{entry.pct} %</td>
                  <td className="num">{formatCurrency(entry.amount)}</td>
                  <td>
                    <span className={`badge-pill ${INVOICE_STATUS_BADGE[entry.status]}`}>{INVOICE_STATUS_LABELS[entry.status]}</span>
                  </td>
                  <td>{entry.invoiceNumber ?? "—"}</td>
                  <td>{formatDate(entry.dueDate)}</td>
                  <td className="num">{formatCurrency(entry.paidAmount)}</td>
                  <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {!entry.requestedAt && !entry.invoiceNumber && canRequest && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={requestMutation.isPending}
                        onClick={() => requestMutation.mutate(entry.id)}
                      >
                        Demander
                      </button>
                    )}
                    {canRecord && (
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => openRecord(entry)}>
                        {entry.invoiceNumber ? "Modifier" : "Enregistrer"}
                      </button>
                    )}
                    {entry.invoiceNumber && canPay && (
                      <button type="button" className="btn btn-small" onClick={() => openPayment(entry)}>
                        Paiement
                      </button>
                    )}
                  </td>
                </tr>
                {expanded?.id === entry.id && expanded.type === "record" && (
                  <tr>
                    <td colSpan={8}>
                      <form
                        className="form-grid"
                        style={{ margin: "8px 0" }}
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!invoiceNumberDraft.trim()) return;
                          recordMutation.mutate({ id: entry.id, invoiceNumber: invoiceNumberDraft.trim(), dueDate: dueDateDraft || undefined });
                        }}
                      >
                        <div className="field">
                          <label>Numéro de facture</label>
                          <input value={invoiceNumberDraft} onChange={(e) => setInvoiceNumberDraft(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Échéance (facultatif)</label>
                          <input type="date" value={dueDateDraft} onChange={(e) => setDueDateDraft(e.target.value)} />
                        </div>
                        <div className="field field-full" style={{ display: "flex", gap: 8 }}>
                          <button type="submit" className="btn btn-small" disabled={!invoiceNumberDraft.trim() || recordMutation.isPending}>
                            {recordMutation.isPending ? "…" : "Enregistrer"}
                          </button>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => setExpanded(null)}>
                            Annuler
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                )}
                {expanded?.id === entry.id && expanded.type === "payment" && (
                  <tr>
                    <td colSpan={8}>
                      <form
                        className="form-grid"
                        style={{ margin: "8px 0" }}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const value = Number(paidAmountDraft);
                          if (!(value >= 0)) return;
                          paymentMutation.mutate({ id: entry.id, paidAmount: value });
                        }}
                      >
                        <div className="field">
                          <label>Montant payé à ce jour ($)</label>
                          <input type="number" min={0} step="0.01" value={paidAmountDraft} onChange={(e) => setPaidAmountDraft(e.target.value)} />
                        </div>
                        <div className="field field-full" style={{ display: "flex", gap: 8 }}>
                          <button type="submit" className="btn btn-small" disabled={paymentMutation.isPending}>
                            {paymentMutation.isPending ? "…" : "Enregistrer le paiement"}
                          </button>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => setExpanded(null)}>
                            Annuler
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
