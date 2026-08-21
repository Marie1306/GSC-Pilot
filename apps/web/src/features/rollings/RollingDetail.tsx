import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  canCreateRollingDirectly,
  canMarkProductionComplete,
  canChooseFulfillmentMode,
  canCreateInvoiceRecord,
  canRecordPayment,
  canManagePostMortem,
  FULFILLMENT_MODES,
  type FulfillmentMode,
} from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import { FULFILLMENT_MODE_LABELS, FULFILLMENT_STATUS_LABELS } from "../projects/api.js";
import {
  fetchRollingDetail,
  updateRollingSold,
  fetchRollingInvoicePlan,
  markRollingProductionComplete,
  chooseRollingFulfillmentMode,
  confirmRollingFulfillment,
  requestInvoice,
  recordInvoice,
  recordInvoicePayment,
  formatCurrency,
  type ChooseRollingFulfillmentInput,
} from "./api.js";
import { RollingPostMortem } from "./RollingPostMortem.js";
import "./rollings.css";

interface RollingDetailProps {
  id: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = { active: "Actif", ready_invoice: "Terminé" };
// "installation" jamais offert pour un roulement (spec confirmée) — voir rollings/service.ts.
const ROLLING_MODES: ChooseRollingFulfillmentInput["mode"][] = [FULFILLMENT_MODES.WAREHOUSE, FULFILLMENT_MODES.MANUAL, FULFILLMENT_MODES.PICKUP];
const CONFIRMABLE_MODES: string[] = [FULFILLMENT_MODES.MANUAL, FULFILLMENT_MODES.PICKUP];

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

export function RollingDetail({ id, onClose }: RollingDetailProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["rolling", id], queryFn: () => fetchRollingDetail(id) });
  const planQuery = useQuery({ queryKey: ["rolling", id, "invoice-plan"], queryFn: () => fetchRollingInvoicePlan(id) });
  const rolling = detailQuery.data?.rolling;

  const [soldDraft, setSoldDraft] = useState<string | null>(null);
  const [modeForm, setModeForm] = useState(false);
  const [mode, setMode] = useState<ChooseRollingFulfillmentInput["mode"]>(FULFILLMENT_MODES.WAREHOUSE);
  const [driverId, setDriverId] = useState("");
  const [address, setAddress] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [showPostMortem, setShowPostMortem] = useState(false);
  const [invoiceNumberDraft, setInvoiceNumberDraft] = useState("");
  const [paidAmountDraft, setPaidAmountDraft] = useState("");
  const [expandedEntry, setExpandedEntry] = useState<{ id: string; type: "record" | "payment" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const employeesQuery = useQuery({ queryKey: ["time-entries", "employees"], queryFn: fetchPunchableEmployees, enabled: modeForm });

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["rolling", id] });
    void queryClient.invalidateQueries({ queryKey: ["rollings"] });
  };
  const invalidatePlan = () => void queryClient.invalidateQueries({ queryKey: ["rolling", id, "invoice-plan"] });
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const soldMutation = useMutation({
    mutationFn: (sold: number) => updateRollingSold(id, sold),
    onSuccess: () => {
      setSoldDraft(null);
      invalidate();
      invalidatePlan();
    },
    onError: onMutationError,
  });
  const completeMutation = useMutation({ mutationFn: () => markRollingProductionComplete(id), onSuccess: invalidate, onError: onMutationError });
  const chooseModeMutation = useMutation({
    mutationFn: () =>
      chooseRollingFulfillmentMode(id, {
        mode,
        driverId: mode === FULFILLMENT_MODES.WAREHOUSE ? driverId || undefined : undefined,
        address: address.trim() || undefined,
        scheduled: scheduled || undefined,
      }),
    onSuccess: () => {
      setModeForm(false);
      invalidate();
    },
    onError: onMutationError,
  });
  const confirmMutation = useMutation({
    mutationFn: () => confirmRollingFulfillment(id, confirmNote.trim() || undefined),
    onSuccess: () => {
      setConfirmNote("");
      invalidate();
    },
    onError: onMutationError,
  });
  const requestMutation = useMutation({ mutationFn: (entryId: string) => requestInvoice(entryId), onSuccess: invalidatePlan, onError: onMutationError });
  const recordMutation = useMutation({
    mutationFn: ({ entryId, invoiceNumber }: { entryId: string; invoiceNumber: string }) => recordInvoice(entryId, { invoiceNumber }),
    onSuccess: () => {
      setExpandedEntry(null);
      invalidatePlan();
    },
    onError: onMutationError,
  });
  const paymentMutation = useMutation({
    mutationFn: ({ entryId, paidAmount }: { entryId: string; paidAmount: number }) => recordInvoicePayment(entryId, paidAmount),
    onSuccess: () => {
      setExpandedEntry(null);
      invalidatePlan();
    },
    onError: onMutationError,
  });

  if (!employee) return null;
  const canEditSold = canCreateRollingDirectly(employee.persona);
  const canComplete = canMarkProductionComplete(employee.persona);
  const canChoose = canChooseFulfillmentMode(employee.persona);
  const canRecord = canCreateInvoiceRecord(employee.persona);
  const canPay = canRecordPayment(employee.persona);
  const canConfirm = canChoose && !!rolling?.fulfillmentMode && CONFIRMABLE_MODES.includes(rolling.fulfillmentMode) && rolling.fulfillmentStatus === "awaiting_confirmation";
  const canOpenPostMortem = canManagePostMortem(employee.persona) && rolling?.status === "ready_invoice";

  if (!rolling) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="modal-body">{detailQuery.isError ? "Roulement introuvable." : "Chargement…"}</div>
        </div>
      </div>
    );
  }

  const plan = planQuery.data?.plan ?? [];
  const sold = soldDraft ?? (rolling.sold !== undefined ? String(rolling.sold) : "");

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div>
            <h2>{rolling.company ?? rolling.contactName}</h2>
            <p className="modal-subtitle">Roulement créé le {formatDate(rolling.createdAt)}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="stat-tile-grid">
            <div className="stat-tile">
              <span className="stat-tile-label">Statut</span>
              <span className={`badge-pill ${rolling.status === "ready_invoice" ? "badge-conforme" : "badge-neutral"}`}>
                {STATUS_LABELS[rolling.status] ?? rolling.status}
              </span>
            </div>
            {rolling.sold !== undefined && (
              <div className="stat-tile">
                <span className="stat-tile-label">Revenu</span>
                <span className="stat-tile-value">{formatCurrency(rolling.sold)}</span>
              </div>
            )}
            {rolling.fulfillmentMode && (
              <div className="stat-tile">
                <span className="stat-tile-label">Mode de sortie</span>
                <span className="stat-tile-value">{FULFILLMENT_MODE_LABELS[rolling.fulfillmentMode as FulfillmentMode]}</span>
              </div>
            )}
            {rolling.fulfillmentStatus && (
              <div className="stat-tile">
                <span className="stat-tile-label">Sortie</span>
                <span className="stat-tile-value">{FULFILLMENT_STATUS_LABELS[rolling.fulfillmentStatus] ?? rolling.fulfillmentStatus}</span>
              </div>
            )}
          </div>

          <div className="rolling-contact-card">
            <strong>
              {rolling.contactName}
              {rolling.company ? ` — ${rolling.company}` : ""}
            </strong>
            {rolling.contactPhone && <div className="rolling-contact-line">📞 {rolling.contactPhone}</div>}
            {rolling.contactEmail && <div className="rolling-contact-line">✉️ {rolling.contactEmail}</div>}
            {rolling.budgetDisplayId && <div className="rolling-contact-line">Depuis le budgétaire {rolling.budgetDisplayId}</div>}
          </div>

          {error && <p className="form-error">{error}</p>}

          {!rolling.budgetId && canEditSold && rolling.sold === 0 && (
            <div className="field" style={{ maxWidth: 220 }}>
              <label>Prix vendu ($)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" min={0} step="0.01" value={sold} onChange={(e) => setSoldDraft(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={!sold || Number(sold) <= 0 || soldMutation.isPending}
                  onClick={() => soldMutation.mutate(Number(sold))}
                >
                  {soldMutation.isPending ? "…" : "Enregistrer"}
                </button>
              </div>
            </div>
          )}

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Production et sortie</h3>
            </div>
          </div>

          {!rolling.productionCompleted && canComplete && (
            <button type="button" className="btn btn-small" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
              {completeMutation.isPending ? "…" : "Marquer la production complétée"}
            </button>
          )}

          {rolling.productionCompleted && !rolling.fulfillmentMode && canChoose && !modeForm && (
            <button type="button" className="btn btn-small" onClick={() => setModeForm(true)}>
              Choisir le mode de sortie
            </button>
          )}

          {modeForm && (
            <form
              className="form-grid"
              style={{ marginTop: 10 }}
              onSubmit={(event) => {
                event.preventDefault();
                chooseModeMutation.mutate();
              }}
            >
              <div className="field">
                <label>Mode de sortie</label>
                <select value={mode} onChange={(e) => setMode(e.target.value as ChooseRollingFulfillmentInput["mode"])}>
                  {ROLLING_MODES.map((value) => (
                    <option key={value} value={value}>
                      {FULFILLMENT_MODE_LABELS[value as FulfillmentMode]}
                    </option>
                  ))}
                </select>
              </div>
              {mode === FULFILLMENT_MODES.WAREHOUSE && (
                <>
                  <div className="field">
                    <label>Magasinier</label>
                    <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                      <option value="">Non assigné</option>
                      {employeesQuery.data?.employees.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Adresse de livraison</label>
                    <input value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Date planifiée (facultatif)</label>
                    <input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
                  </div>
                </>
              )}
              <div className="field field-full" style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-small" disabled={chooseModeMutation.isPending}>
                  {chooseModeMutation.isPending ? "…" : "Confirmer le mode"}
                </button>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setModeForm(false)}>
                  Annuler
                </button>
              </div>
            </form>
          )}

          {canConfirm && (
            <div className="card" style={{ marginTop: 10, background: "var(--gsc-color-surface2)", border: "none" }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 13 }}>Note de confirmation (facultatif)</label>
              <input style={{ width: "100%", marginBottom: 8 }} value={confirmNote} onChange={(e) => setConfirmNote(e.target.value)} />
              <button type="button" className="btn btn-small" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                {confirmMutation.isPending ? "…" : "Confirmer la sortie"}
              </button>
            </div>
          )}

          {rolling.fulfillmentMode === FULFILLMENT_MODES.WAREHOUSE && rolling.fulfillmentStatus === "planned" && (
            <p style={{ margin: "10px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>
              Bon de livraison créé — assigné au magasinier{rolling.fulfillmentDriverName ? ` (${rolling.fulfillmentDriverName})` : ""}, voir Livraisons.
            </p>
          )}
          {rolling.fulfillmentConfirmationNote && (
            <p style={{ margin: "10px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>Note : {rolling.fulfillmentConfirmationNote}</p>
          )}

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Facturation</h3>
            </div>
          </div>
          {plan.length === 0 ? (
            <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun jalon — le prix vendu n'est pas encore connu.</p>
          ) : (
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th className="num">Montant</th>
                  <th className="num">Payé</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plan.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.invoiceNumber ?? "—"}</td>
                    <td className="num">{formatCurrency(entry.amount)}</td>
                    <td className="num">{formatCurrency(entry.paidAmount)}</td>
                    <td>{entry.status}</td>
                    <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {!entry.requestedAt && canRecord && (
                        <button type="button" className="btn btn-secondary btn-small" disabled={requestMutation.isPending} onClick={() => requestMutation.mutate(entry.id)}>
                          Demander
                        </button>
                      )}
                      {canRecord && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => {
                            setExpandedEntry({ id: entry.id, type: "record" });
                            setInvoiceNumberDraft(entry.invoiceNumber ?? "");
                          }}
                        >
                          {entry.invoiceNumber ? "Modifier" : "Enregistrer"}
                        </button>
                      )}
                      {entry.invoiceNumber && canPay && (
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => {
                            setExpandedEntry({ id: entry.id, type: "payment" });
                            setPaidAmountDraft(entry.paidAmount ? String(entry.paidAmount) : "");
                          }}
                        >
                          Paiement
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {expandedEntry?.type === "record" && (
            <form
              className="form-grid"
              style={{ marginTop: 10 }}
              onSubmit={(event) => {
                event.preventDefault();
                if (!invoiceNumberDraft.trim()) return;
                recordMutation.mutate({ entryId: expandedEntry.id, invoiceNumber: invoiceNumberDraft.trim() });
              }}
            >
              <div className="field">
                <label>Numéro de facture</label>
                <input value={invoiceNumberDraft} onChange={(e) => setInvoiceNumberDraft(e.target.value)} autoFocus />
              </div>
              <div className="field field-full" style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-small" disabled={!invoiceNumberDraft.trim() || recordMutation.isPending}>
                  {recordMutation.isPending ? "…" : "Enregistrer"}
                </button>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setExpandedEntry(null)}>
                  Annuler
                </button>
              </div>
            </form>
          )}
          {expandedEntry?.type === "payment" && (
            <form
              className="form-grid"
              style={{ marginTop: 10 }}
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(paidAmountDraft);
                if (!(value >= 0)) return;
                paymentMutation.mutate({ entryId: expandedEntry.id, paidAmount: value });
              }}
            >
              <div className="field">
                <label>Montant payé à ce jour ($)</label>
                <input type="number" min={0} step="0.01" value={paidAmountDraft} onChange={(e) => setPaidAmountDraft(e.target.value)} autoFocus />
              </div>
              <div className="field field-full" style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-small" disabled={paymentMutation.isPending}>
                  {paymentMutation.isPending ? "…" : "Enregistrer le paiement"}
                </button>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setExpandedEntry(null)}>
                  Annuler
                </button>
              </div>
            </form>
          )}

          {canOpenPostMortem && (
            <div style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowPostMortem(true)}>
                Voir le post-mortem
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>

      {showPostMortem && <RollingPostMortem id={id} onClose={() => setShowPostMortem(false)} />}
    </div>
  );
}
