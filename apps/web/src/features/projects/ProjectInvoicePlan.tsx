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
  updateInvoicePlan,
  formatCurrency,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_BADGE,
  type InvoicePlanEntryDto,
  type BillingPlanStepInput,
} from "./api.js";

interface ProjectInvoicePlanProps {
  projectId: string;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

type ExpandedAction = { id: string; type: "record" | "payment" } | null;
interface CycleStepDraft {
  label: string;
  pct: string;
}

/**
 * Cycle de facturation (Projet 2C, 17 août 2026) : les 4 jalons sont créés
 * une seule fois à la conversion (DEFAULT_BILLING_SPLIT, billing.ts). Depuis
 * le 26 août 2026, Direction/Propriétaire peuvent remplacer entièrement ces
 * jalons par un cycle personnalisé (updateProjectBillingPlan, même porte que
 * "Demander la facturation") — bloqué côté serveur (409) dès qu'un jalon a
 * déjà progressé, donc le déclencheur disparaît ici dans ce cas plutôt que
 * de laisser l'utilisatrice remplir un formulaire voué à échouer. Sage reste
 * la source réelle des factures — ceci n'est qu'un suivi manuel,
 * "Enregistrer" ne requiert jamais un "Demander" préalable.
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
  const [showCycleEditor, setShowCycleEditor] = useState(false);
  const [cycleDraft, setCycleDraft] = useState<CycleStepDraft[]>([]);
  const [cycleError, setCycleError] = useState<string | null>(null);

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
  const updatePlanMutation = useMutation({
    mutationFn: (steps: BillingPlanStepInput[]) => updateInvoicePlan(projectId, steps),
    onSuccess: () => {
      setShowCycleEditor(false);
      invalidate();
    },
    onError: (err: unknown) => setCycleError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  if (!employee) return null;
  const canRequest = canRequestInvoice(employee.persona);
  const canRecord = canCreateInvoiceRecord(employee.persona);
  const canPay = canRecordPayment(employee.persona);
  const entries = planQuery.data?.entries ?? [];

  // Ne jamais disparaître en silence : un projet converti avant la Phase 2C
  // (17 août 2026, computeBillingPlan à la conversion) n'a légitimement
  // aucun jalon — mais un vrai échec de chargement doit rester visible,
  // pas se confondre avec "pas de plan".
  if (entries.length === 0) {
    if (planQuery.isError) {
      return (
        <p className="form-error">
          {planQuery.error instanceof ApiError ? planQuery.error.message : "Impossible de charger le cycle de facturation."}
        </p>
      );
    }
    if (planQuery.isLoading) return null;
    return (
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--gsc-color-muted)" }}>
        Aucun cycle de facturation enregistré pour ce projet (converti avant l'activation du cycle automatique le 17 août 2026).
      </p>
    );
  }

  function openRecord(entry: InvoicePlanEntryDto) {
    setExpanded({ id: entry.id, type: "record" });
    setInvoiceNumberDraft(entry.invoiceNumber ?? "");
    setDueDateDraft(entry.dueDate?.slice(0, 10) ?? "");
  }
  function openPayment(entry: InvoicePlanEntryDto) {
    setExpanded({ id: entry.id, type: "payment" });
    setPaidAmountDraft(entry.paidAmount ? String(entry.paidAmount) : "");
  }

  // Même condition que le blocage 409 côté serveur (updateProjectBillingPlan)
  // — évite de laisser l'utilisatrice remplir tout un formulaire voué à
  // échouer une fois qu'un jalon a réellement progressé.
  const started = entries.some((entry) => entry.requestedAt || entry.invoiceNumber || Number(entry.paidAmount) > 0);

  function openCycleEditor() {
    setCycleDraft(entries.map((entry) => ({ label: entry.label, pct: String(entry.pct) })));
    setCycleError(null);
    setShowCycleEditor(true);
  }
  function updateCycleLabel(index: number, label: string) {
    setCycleDraft((current) => current.map((step, i) => (i === index ? { ...step, label } : step)));
  }
  function updateCyclePct(index: number, pct: string) {
    setCycleDraft((current) => current.map((step, i) => (i === index ? { ...step, pct } : step)));
  }
  function removeCycleStep(index: number) {
    setCycleDraft((current) => current.filter((_, i) => i !== index));
  }
  function addCycleStep() {
    setCycleDraft((current) => [...current, { label: "", pct: "" }]);
  }

  const cycleTotalPct = cycleDraft.reduce((sum, step) => sum + (Number(step.pct) || 0), 0);
  const cycleValid =
    cycleDraft.length > 0 &&
    cycleDraft.every((step) => step.label.trim().length > 0 && Number(step.pct) > 0) &&
    Math.round(cycleTotalPct) === 100;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 15, margin: 0 }}>Cycle de facturation</h3>
          <p style={{ margin: "4px 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>Suivi manuel — Sage reste la source réelle des factures.</p>
        </div>
        {canRequest && !started && (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            style={{ flex: "none", whiteSpace: "nowrap" }}
            onClick={openCycleEditor}
          >
            Modifier le cycle
          </button>
        )}
      </div>
      {showCycleEditor && (
        <div className="modal-backdrop" onClick={() => setShowCycleEditor(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(event) => event.stopPropagation()}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!cycleValid) return;
                updatePlanMutation.mutate(cycleDraft.map((step) => ({ label: step.label.trim(), pct: Number(step.pct) })));
              }}
            >
              <div className="modal-header">
                <div>
                  <h2>Modifier le cycle de facturation</h2>
                  <p className="modal-subtitle">Remplace entièrement les jalons actuels — jalons entièrement personnalisables.</p>
                </div>
                <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setShowCycleEditor(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                {cycleError && <p className="form-error">{cycleError}</p>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {cycleDraft.map((step, index) => (
                    <div key={index} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="text"
                        placeholder="Nom du jalon"
                        style={{ flex: 1, minWidth: 120 }}
                        value={step.label}
                        onChange={(e) => updateCycleLabel(index, e.target.value)}
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        placeholder="%"
                        style={{ width: 80 }}
                        value={step.pct}
                        onChange={(e) => updateCyclePct(index, e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        style={{ flex: "none" }}
                        onClick={() => removeCycleStep(index)}
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-secondary btn-small" style={{ marginTop: 10 }} onClick={addCycleStep}>
                  + Ajouter un jalon
                </button>
                <p
                  style={{
                    marginTop: 14,
                    fontSize: 13,
                    fontWeight: 600,
                    color: Math.round(cycleTotalPct) === 100 ? "var(--gsc-color-green)" : "var(--gsc-color-danger)",
                  }}
                >
                  Total : {Math.round(cycleTotalPct * 10) / 10} %
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCycleEditor(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn" disabled={!cycleValid || updatePlanMutation.isPending}>
                  {updatePlanMutation.isPending ? "…" : "Enregistrer le cycle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
                        className="btn"
                        style={{ flex: "none", whiteSpace: "nowrap" }}
                        disabled={requestMutation.isPending}
                        onClick={() => requestMutation.mutate(entry.id)}
                      >
                        ✉ {requestMutation.isPending ? "…" : "Demander la facturation"}
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
                        <div className="field field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                        <div className="field field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
