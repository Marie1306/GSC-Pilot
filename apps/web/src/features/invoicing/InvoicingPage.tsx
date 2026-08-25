import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canCreateInvoiceRecord, canRecordPayment } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import {
  fetchInvoiceEntries,
  recordInvoice,
  recordInvoicePayment,
  formatCurrency,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_BADGE,
  type InvoiceEntryDto,
  type InvoiceEntryStatus,
} from "./api.js";
import "./invoicing.css";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

const TABS: { key: InvoiceEntryStatus | "all"; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "sent", label: "Envoyées" },
  { key: "overdue", label: "En retard" },
  { key: "on_hold", label: "En suspens" },
  { key: "paid", label: "Payées" },
];

type ExpandedAction = { id: string; type: "record" | "payment" } | null;

/**
 * Facturation — vue consolidée (20 août 2026, sur demande explicite de
 * l'utilisatrice). Regroupe les jalons de projet déjà demandés et les
 * appels de service envoyés à l'administration (voir invoicing/service.ts,
 * backend) — un jalon jamais demandé n'apparaît jamais ici, seulement dans
 * le Cycle de facturation du projet lui-même (comportement voulu). Suivi
 * manuel — Sage reste la source réelle de la facture, jamais générée ici.
 * Demander/Enregistrer/Paiement réutilisent exactement les fonctions déjà
 * vérifiées du cycle de facturation projet (ProjectInvoicePlan.tsx) —
 * jamais réimplémentées.
 */
export function InvoicingPage() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const entriesQuery = useQuery({ queryKey: ["invoicing", "entries"], queryFn: fetchInvoiceEntries });
  const [tab, setTab] = useState<InvoiceEntryStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<ExpandedAction>(null);
  const [invoiceNumberDraft, setInvoiceNumberDraft] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [paidAmountDraft, setPaidAmountDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    setExpanded(null);
    void queryClient.invalidateQueries({ queryKey: ["invoicing", "entries"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

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

  const entries = entriesQuery.data?.entries ?? [];

  const stats = { open: 0, openBalance: 0, overdue: 0, onHold: 0, received: 0 };
  for (const entry of entries) {
    const balance = entry.amount - entry.paidAmount;
    stats.received += entry.paidAmount;
    if (entry.status !== "paid") {
      stats.open += entry.amount;
      stats.openBalance += balance;
    }
    if (entry.status === "overdue") stats.overdue += balance;
    if (entry.status === "on_hold") stats.onHold += balance;
  }

  const filtered = entries.filter((entry) => {
    if (tab !== "all" && entry.status !== tab) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return (
      (entry.invoiceNumber ?? "").toLowerCase().includes(needle) ||
      entry.clientLabel.toLowerCase().includes(needle) ||
      entry.sourceLabel.toLowerCase().includes(needle)
    );
  });

  if (!employee) return null;
  const canRecord = canCreateInvoiceRecord(employee.persona);
  const canPay = canRecordPayment(employee.persona);

  function openRecord(entry: InvoiceEntryDto) {
    setExpanded({ id: entry.id, type: "record" });
    setInvoiceNumberDraft(entry.invoiceNumber ?? "");
    setDueDateDraft(entry.dueDate?.slice(0, 10) ?? "");
  }
  function openPayment(entry: InvoiceEntryDto) {
    setExpanded({ id: entry.id, type: "payment" });
    setPaidAmountDraft(entry.paidAmount ? String(entry.paidAmount) : "");
  }

  return (
    <div>
      <div className="stat-tile-grid">
        <div className="stat-tile">
          <span className="stat-tile-label">Facture ouverte</span>
          <span className="stat-tile-value">{formatCurrency(stats.open)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">Solde à recevoir</span>
          <span className="stat-tile-value">{formatCurrency(stats.openBalance)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">En retard</span>
          <span className="stat-tile-value" style={{ color: "var(--gsc-color-danger)" }}>
            {formatCurrency(stats.overdue)}
          </span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">En suspens</span>
          <span className="stat-tile-value">{formatCurrency(stats.onHold)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">Reçu</span>
          <span className="stat-tile-value" style={{ color: "var(--gsc-color-green)" }}>
            {formatCurrency(stats.received)}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={tab === t.key ? "btn btn-small" : "btn btn-secondary btn-small"}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input placeholder="Facture ou client…" value={search} onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 220 }} />
        </div>

        {error && <p className="form-error">{error}</p>}

        {entriesQuery.isError ? (
          <p className="form-error">Impossible de charger la facturation.</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune facture pour ce filtre.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Client / dossier</th>
                  <th>Envoyée</th>
                  <th>Échéance</th>
                  <th className="num">Montant</th>
                  <th className="num">Payé</th>
                  <th className="num">Solde</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr>
                      <td>{entry.invoiceNumber ?? "—"}</td>
                      <td>
                        <div>{entry.clientLabel}</div>
                        <div className="cell-sub">{entry.sourceLabel}</div>
                      </td>
                      <td>{formatDate(entry.processedAt)}</td>
                      <td>{formatDate(entry.dueDate)}</td>
                      <td className="num">{formatCurrency(entry.amount)}</td>
                      <td className="num">{formatCurrency(entry.paidAmount)}</td>
                      <td className="num">{formatCurrency(entry.amount - entry.paidAmount)}</td>
                      <td>
                        <span className={`badge-pill ${INVOICE_STATUS_BADGE[entry.status]}`}>{INVOICE_STATUS_LABELS[entry.status]}</span>
                      </td>
                      <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
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
                        <td colSpan={9}>
                          <form
                            className="form-grid"
                            style={{ margin: "8px 0" }}
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (!invoiceNumberDraft.trim()) return;
                              recordMutation.mutate({
                                id: entry.id,
                                invoiceNumber: invoiceNumberDraft.trim(),
                                dueDate: dueDateDraft || undefined,
                              });
                            }}
                          >
                            <div className="field">
                              <label>Numéro de facture</label>
                              <input value={invoiceNumberDraft} onChange={(event) => setInvoiceNumberDraft(event.target.value)} />
                            </div>
                            <div className="field">
                              <label>Échéance (facultatif)</label>
                              <input type="date" value={dueDateDraft} onChange={(event) => setDueDateDraft(event.target.value)} />
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
                        <td colSpan={9}>
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
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={paidAmountDraft}
                                onChange={(event) => setPaidAmountDraft(event.target.value)}
                              />
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
        )}
      </div>
    </div>
  );
}
