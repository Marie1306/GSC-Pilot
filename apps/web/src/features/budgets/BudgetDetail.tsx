import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canModifyBudget, canApproveBudgetForSending, canRecordBudgetOutcome } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import {
  fetchBudgetDetail,
  updateRowHours,
  updateSectionComplexity,
  updateBackupSettings,
  markBudgetReady,
  markBudgetSent,
  markBudgetWon,
  markBudgetDeclined,
  formatCurrency,
  STATUS_LABELS,
  CATEGORY_LABELS,
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

export function BudgetDetail({ id, onClose }: BudgetDetailProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["budget", id], queryFn: () => fetchBudgetDetail(id) });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["budget", id] });
    void queryClient.invalidateQueries({ queryKey: ["budgets"] });
  };

  const rowMutation = useMutation({
    mutationFn: ({ rowId, hours }: { rowId: string; hours: number }) => updateRowHours(id, rowId, hours),
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
  const busy = rowMutation.isPending || complexityMutation.isPending || backupMutation.isPending || statusMutation.isPending;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal budget-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{budget ? `${budget.displayId} — ${budget.company ?? budget.contactName}` : "Budgétaire"}</h2>
            {budget && (
              <p className="modal-subtitle">
                Créé par {budget.createdByName} · {formatDate(budget.createdAt)}
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

              {budget.sections.map((section) => (
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
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.label}</td>
                          <td className="num">{formatCurrency(row.hourlyRate)}</td>
                          <td className="num">
                            <input
                              key={`${row.id}-${row.hours}`}
                              type="number"
                              min={0}
                              step={0.25}
                              defaultValue={row.hours}
                              disabled={!canModify || busy}
                              onBlur={(e) => {
                                const hours = Number(e.target.value || 0);
                                if (hours !== row.hours) rowMutation.mutate({ rowId: row.id, hours });
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
              ))}

              <section className="card budget-section">
                <div className="budget-section-header">
                  <div>
                    <h3>Back-up projet</h3>
                    <small>Réserve d'heures calculée sur Fabrication + Programmation + Assemblage — non punchable.</small>
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
