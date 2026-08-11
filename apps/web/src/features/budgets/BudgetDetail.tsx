import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canModifyBudget, canApproveBudgetForSending, canRecordBudgetOutcome } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import {
  fetchBudgetDetail,
  updateRow,
  addBudgetRow,
  removeBudgetRow,
  updateSectionComplexity,
  updateBackupSettings,
  updateProjectBackup,
  updateBudgetMeta,
  markBudgetReady,
  markBudgetSent,
  markBudgetWon,
  markBudgetDeclined,
  formatCurrency,
  STATUS_LABELS,
  CATEGORY_LABELS,
  MODULAR_CATEGORIES,
  type UpdateRowPatch,
  type UpdateBudgetMetaInput,
} from "./api.js";

interface BudgetDetailProps {
  id: string;
  onClose: () => void;
}

const COMPLEXITY_OPTIONS = Array.from({ length: 11 }, (_, i) => i);
type StatusAction = "ready" | "sent" | "won" | "declined";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function BudgetDetail({ id, onClose }: BudgetDetailProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["budget", id], queryFn: () => fetchBudgetDetail(id) });
  const [addingRowSectionId, setAddingRowSectionId] = useState<string | null>(null);
  const [newRowLabel, setNewRowLabel] = useState("");
  const [newRowPurchase, setNewRowPurchase] = useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["budget", id] });
    void queryClient.invalidateQueries({ queryKey: ["budgets"] });
  };

  const rowMutation = useMutation({
    mutationFn: ({ rowId, patch }: { rowId: string; patch: UpdateRowPatch }) => updateRow(id, rowId, patch),
    onSuccess: invalidate,
  });
  const addRowMutation = useMutation({
    mutationFn: ({ sectionId, label, purchaseAmount }: { sectionId: string; label: string; purchaseAmount: number }) =>
      addBudgetRow(id, sectionId, { label, purchaseAmount }),
    onSuccess: () => {
      setAddingRowSectionId(null);
      setNewRowLabel("");
      setNewRowPurchase("");
      invalidate();
    },
  });
  const removeRowMutation = useMutation({
    mutationFn: (rowId: string) => removeBudgetRow(id, rowId),
    onSuccess: invalidate,
  });
  const complexityMutation = useMutation({
    mutationFn: ({ sectionId, complexity }: { sectionId: string; complexity: number }) => updateSectionComplexity(id, sectionId, complexity),
    onSuccess: invalidate,
  });
  const backupMutation = useMutation({
    mutationFn: (patch: { pct?: number; complexity?: number }) => updateBackupSettings(id, patch),
    onSuccess: invalidate,
  });
  const projectBackupMutation = useMutation({
    mutationFn: (patch: { amount?: number; complexity?: number }) => updateProjectBackup(id, patch),
    onSuccess: invalidate,
  });
  const metaMutation = useMutation({
    mutationFn: (patch: UpdateBudgetMetaInput) => updateBudgetMeta(id, patch),
    onSuccess: invalidate,
  });
  const statusMutation = useMutation({
    mutationFn: (action: StatusAction) => {
      if (action === "ready") return markBudgetReady(id);
      if (action === "sent") return markBudgetSent(id);
      if (action === "won") return markBudgetWon(id);
      return markBudgetDeclined(id);
    },
    onSuccess: invalidate,
  });

  if (!employee) return null;

  const budget = detailQuery.data?.budget;
  const canModify = canModifyBudget(employee.persona);
  const canApprove = canApproveBudgetForSending(employee.persona);
  const canOutcome = canRecordBudgetOutcome(employee.persona);
  const busy =
    rowMutation.isPending ||
    addRowMutation.isPending ||
    removeRowMutation.isPending ||
    complexityMutation.isPending ||
    backupMutation.isPending ||
    projectBackupMutation.isPending ||
    metaMutation.isPending ||
    statusMutation.isPending;

  function handleAddRow(event: FormEvent, sectionId: string) {
    event.preventDefault();
    if (!newRowLabel.trim()) return;
    addRowMutation.mutate({ sectionId, label: newRowLabel.trim(), purchaseAmount: Number(newRowPurchase || 0) });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal budget-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{budget ? `${budget.displayId} — ${budget.company ?? budget.contactName}` : "Budgétaire"}</h2>
            {budget && (
              <p className="modal-subtitle">
                Créé par {budget.createdByName} · {formatDate(budget.createdAt)}
                {budget.clientRequestDisplayId && <> · Demande d'origine : {budget.clientRequestDisplayId}</>}
              </p>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!budget && <p>Chargement…</p>}
          {budget && (
            <>
              <div className="budget-total-bar">
                <div>
                  <span className="detail-label">Statut</span>
                  <span>{STATUS_LABELS[budget.status] ?? budget.status}</span>
                </div>
                <div>
                  <span className="detail-label">Heures totales</span>
                  <span>{budget.totals.totalHours}</span>
                </div>
                <div>
                  <span className="detail-label">Coût planifié</span>
                  <span>{formatCurrency(budget.totals.totalBaseCost)}</span>
                </div>
                <div className="budget-total-highlight">
                  <span className="detail-label">Prix de vente</span>
                  <span>{formatCurrency(budget.totals.totalSale)}</span>
                </div>
              </div>

              <section className="card budget-section">
                <div className="budget-section-header">
                  <h3>Informations du budgétaire</h3>
                </div>
                <div className="form-grid budget-meta-grid">
                  <div className="field">
                    <label htmlFor="meta-po">PO client (facultatif)</label>
                    <input
                      id="meta-po"
                      key={`po-${budget.poNumber}`}
                      defaultValue={budget.poNumber ?? ""}
                      disabled={!canModify || busy}
                      onBlur={(e) => {
                        const value = e.target.value.trim() || null;
                        if (value !== budget.poNumber) metaMutation.mutate({ poNumber: value });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="meta-quantity">Quantité</label>
                    <input
                      id="meta-quantity"
                      key={`qty-${budget.quantity}`}
                      type="number"
                      min={1}
                      defaultValue={budget.quantity}
                      disabled={!canModify || busy}
                      onBlur={(e) => {
                        const value = Math.max(1, Number(e.target.value || 1));
                        if (value !== budget.quantity) metaMutation.mutate({ quantity: value });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="meta-validUntil">Valide jusqu'au (facultatif)</label>
                    <input
                      id="meta-validUntil"
                      key={`valid-${budget.validUntil}`}
                      type="date"
                      defaultValue={toDateInputValue(budget.validUntil)}
                      disabled={!canModify || busy}
                      onBlur={(e) => {
                        const value = e.target.value.trim() || null;
                        if (value !== toDateInputValue(budget.validUntil)) metaMutation.mutate({ validUntil: value });
                      }}
                    />
                  </div>
                  <div className="field field-full">
                    <label htmlFor="meta-summary">Résumé du budgétaire (facultatif)</label>
                    <textarea
                      id="meta-summary"
                      key={`summary-${budget.summary}`}
                      rows={2}
                      placeholder="Portée, hypothèses, prix, échéancier…"
                      defaultValue={budget.summary ?? ""}
                      disabled={!canModify || busy}
                      onBlur={(e) => {
                        const value = e.target.value.trim() || null;
                        if (value !== budget.summary) metaMutation.mutate({ summary: value });
                      }}
                    />
                  </div>
                  <div className="field field-full">
                    <label htmlFor="meta-riskSummary">Résumé des risques (facultatif)</label>
                    <textarea
                      id="meta-riskSummary"
                      key={`risk-summary-${budget.riskSummary}`}
                      rows={2}
                      placeholder="Complexité, ressources critiques, disponibilité des composantes…"
                      defaultValue={budget.riskSummary ?? ""}
                      disabled={!canModify || busy}
                      onBlur={(e) => {
                        const value = e.target.value.trim() || null;
                        if (value !== budget.riskSummary) metaMutation.mutate({ riskSummary: value });
                      }}
                    />
                  </div>
                </div>
              </section>

              {budget.sections.map((section) => {
                const isModular = MODULAR_CATEGORIES.includes(section.category);
                return (
                  <section key={section.id} className="card budget-section">
                    <div className="budget-section-header">
                      <h3>{CATEGORY_LABELS[section.category] ?? section.category}</h3>
                      <div className="field budget-complexity-field">
                        <label htmlFor={`complexity-${section.id}`}>Complexité</label>
                        <select
                          id={`complexity-${section.id}`}
                          value={section.complexity}
                          disabled={!canModify || busy}
                          onChange={(e) => complexityMutation.mutate({ sectionId: section.id, complexity: Number(e.target.value) })}
                        >
                          {COMPLEXITY_OPTIONS.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <table className="shortlist-table budget-rows-table">
                      <thead>
                        <tr>
                          <th>Tâche</th>
                          <th className="num">Taux</th>
                          <th className="num">Heures</th>
                          <th className="num">Achat direct</th>
                          <th>Risque / note</th>
                          {isModular && canModify && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.label}</td>
                            <td className="num">{formatCurrency(row.hourlyRate)}</td>
                            <td className="num">
                              <input
                                key={`hours-${row.id}-${row.hours}`}
                                type="number"
                                min={0}
                                step={0.25}
                                defaultValue={row.hours}
                                disabled={!canModify || busy}
                                onBlur={(e) => {
                                  const hours = Number(e.target.value || 0);
                                  if (hours !== row.hours) rowMutation.mutate({ rowId: row.id, patch: { hours } });
                                }}
                              />
                            </td>
                            <td className="num">
                              <input
                                key={`purchase-${row.id}-${row.purchaseAmount}`}
                                type="number"
                                min={0}
                                step={1}
                                defaultValue={row.purchaseAmount}
                                disabled={!canModify || busy}
                                onBlur={(e) => {
                                  const purchaseAmount = Number(e.target.value || 0);
                                  if (purchaseAmount !== row.purchaseAmount) rowMutation.mutate({ rowId: row.id, patch: { purchaseAmount } });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                key={`risk-${row.id}-${row.risk}`}
                                placeholder="Risque, hypothèse ou note"
                                defaultValue={row.risk ?? ""}
                                disabled={!canModify || busy}
                                onBlur={(e) => {
                                  const risk = e.target.value.trim() || null;
                                  if (risk !== row.risk) rowMutation.mutate({ rowId: row.id, patch: { risk } });
                                }}
                              />
                            </td>
                            {isModular && canModify && (
                              <td>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  aria-label="Retirer la ligne"
                                  disabled={busy || section.rows.length === 1}
                                  onClick={() => removeRowMutation.mutate(row.id)}
                                >
                                  ×
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {isModular && canModify && (
                      <div className="budget-add-row">
                        {addingRowSectionId === section.id ? (
                          <form className="budget-add-row-form" onSubmit={(e) => handleAddRow(e, section.id)}>
                            <input
                              placeholder="Nom de la ligne"
                              value={newRowLabel}
                              onChange={(e) => setNewRowLabel(e.target.value)}
                              autoFocus
                            />
                            <input
                              type="number"
                              min={0}
                              placeholder="Achat $ (facultatif)"
                              value={newRowPurchase}
                              onChange={(e) => setNewRowPurchase(e.target.value)}
                            />
                            <button type="submit" className="btn btn-secondary" disabled={!newRowLabel.trim() || busy}>
                              Ajouter
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => {
                                setAddingRowSectionId(null);
                                setNewRowLabel("");
                                setNewRowPurchase("");
                              }}
                            >
                              Annuler
                            </button>
                          </form>
                        ) : (
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => setAddingRowSectionId(section.id)}>
                            + Ajouter une ligne
                          </button>
                        )}
                      </div>
                    )}
                    <div className="budget-section-total">
                      <span>
                        Heures <strong>{section.hours}</strong>
                      </span>
                      <span>
                        Coût planifié <strong>{formatCurrency(section.baseCost)}</strong>
                      </span>
                      <span>Marge {section.margin} %</span>
                      <span>
                        Prix de vente <strong>{formatCurrency(section.sale)}</strong>
                      </span>
                    </div>
                  </section>
                );
              })}

              <section className="card budget-section">
                <div className="budget-section-header">
                  <div>
                    <h3>Back-up d'heures</h3>
                    <small>Réserve calculée automatiquement sur Fabrication + Programmation + Assemblage — non punchable.</small>
                  </div>
                </div>
                <div className="form-grid budget-backup-grid">
                  <div className="field">
                    <label htmlFor="backup-pct">% des heures admissibles</label>
                    <input
                      id="backup-pct"
                      key={`pct-${budget.backupHoursPct}`}
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={budget.backupHoursPct}
                      disabled={!canModify || busy}
                      onBlur={(e) => {
                        const pct = Number(e.target.value || 0);
                        if (pct !== budget.backupHoursPct) backupMutation.mutate({ pct });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="backup-complexity">Complexité</label>
                    <select
                      id="backup-complexity"
                      value={budget.backupHoursComplexity}
                      disabled={!canModify || busy}
                      onChange={(e) => backupMutation.mutate({ complexity: Number(e.target.value) })}
                    >
                      {COMPLEXITY_OPTIONS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="budget-section-total">
                  <span>
                    Heures <strong>{budget.backup.hours}</strong>
                  </span>
                  <span>
                    Coût planifié <strong>{formatCurrency(budget.backup.baseCost)}</strong>
                  </span>
                  <span>Marge {budget.backup.margin} %</span>
                  <span>
                    Prix de vente <strong>{formatCurrency(budget.backup.sale)}</strong>
                  </span>
                </div>
              </section>

              <section className="card budget-section">
                <div className="budget-section-header">
                  <div>
                    <h3>Back-up projet</h3>
                    <small>Réserve distincte du back-up d'heures ci-dessus — montant saisi à la main, la complexité détermine la marge.</small>
                  </div>
                </div>
                <div className="form-grid budget-backup-grid">
                  <div className="field">
                    <label htmlFor="project-backup-amount">Montant de réserve</label>
                    <input
                      id="project-backup-amount"
                      key={`pb-amount-${budget.projectBackupAmount}`}
                      type="number"
                      min={0}
                      step={100}
                      defaultValue={budget.projectBackupAmount}
                      disabled={!canModify || busy}
                      onBlur={(e) => {
                        const amount = Number(e.target.value || 0);
                        if (amount !== budget.projectBackupAmount) projectBackupMutation.mutate({ amount });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="project-backup-complexity">Complexité</label>
                    <select
                      id="project-backup-complexity"
                      value={budget.projectBackupComplexity}
                      disabled={!canModify || busy}
                      onChange={(e) => projectBackupMutation.mutate({ complexity: Number(e.target.value) })}
                    >
                      {COMPLEXITY_OPTIONS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="budget-section-total">
                  <span>
                    Coût planifié <strong>{formatCurrency(budget.projectBackup.baseCost)}</strong>
                  </span>
                  <span>Marge {budget.projectBackup.margin} %</span>
                  <span>
                    Prix de vente <strong>{formatCurrency(budget.projectBackup.sale)}</strong>
                  </span>
                </div>
              </section>

              <div className="status-row">
                <span className="detail-label">Suivi</span>
                <div className="status-actions">
                  {budget.status === "draft" && canApprove && (
                    <button type="button" className="btn" disabled={busy} onClick={() => statusMutation.mutate("ready")}>
                      Marquer le budgétaire prêt
                    </button>
                  )}
                  {budget.status === "ready" && canOutcome && (
                    <button type="button" className="btn" disabled={busy} onClick={() => statusMutation.mutate("sent")}>
                      Marquer la soumission envoyée
                    </button>
                  )}
                  {budget.status === "sent" && canOutcome && (
                    <>
                      <button type="button" className="btn" disabled={busy} onClick={() => statusMutation.mutate("won")}>
                        Contrat obtenu
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => statusMutation.mutate("declined")}>
                        Refusé
                      </button>
                    </>
                  )}
                  {(budget.status === "won" || budget.status === "declined") && (
                    <span className={`status-btn ${budget.status === "won" ? "status-btn-active" : ""}`}>{STATUS_LABELS[budget.status]}</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
