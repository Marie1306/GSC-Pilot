import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
  setRecurringExpenseOverride,
  clearRecurringExpenseOverride,
  formatCurrency,
  type RecurringExpenseDto,
} from "./api.js";

function formatYearMonth(yearMonth: string): string {
  return new Date(`${yearMonth}-01T00:00:00`).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
}

/**
 * Dépenses récurrentes (loyer, assurances, Claude, etc.) — un montant par
 * défaut appliqué chaque mois au jour choisi, avec possibilité de corriger
 * le montant d'UN mois précis (override) sans toucher aux autres mois
 * (resolveRecurringOccurrences, business-rules/treasury.ts).
 */
export function RecurringExpensesCard() {
  const queryClient = useQueryClient();
  const expensesQuery = useQuery({ queryKey: ["treasury", "recurring-expenses"], queryFn: fetchRecurringExpenses });
  const [newLabel, setNewLabel] = useState("");
  const [newDay, setNewDay] = useState("1");
  const [newAmount, setNewAmount] = useState("");
  const [overrideOpenId, setOverrideOpenId] = useState<string | null>(null);
  const [overrideMonth, setOverrideMonth] = useState("");
  const [overrideAmount, setOverrideAmount] = useState("");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["treasury"] });

  const createMutation = useMutation({
    mutationFn: () => createRecurringExpense({ label: newLabel.trim(), dayOfMonth: Number(newDay), defaultAmount: Number(newAmount) }),
    onSuccess: () => {
      setNewLabel("");
      setNewDay("1");
      setNewAmount("");
      invalidate();
    },
  });
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateRecurringExpense(id, { active }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({ mutationFn: deleteRecurringExpense, onSuccess: invalidate });
  const setOverrideMutation = useMutation({
    mutationFn: () => setRecurringExpenseOverride(overrideOpenId!, overrideMonth, Number(overrideAmount)),
    onSuccess: () => {
      setOverrideOpenId(null);
      setOverrideMonth("");
      setOverrideAmount("");
      invalidate();
    },
  });
  const clearOverrideMutation = useMutation({
    mutationFn: ({ id, yearMonth }: { id: string; yearMonth: string }) => clearRecurringExpenseOverride(id, yearMonth),
    onSuccess: invalidate,
  });

  const expenses = expensesQuery.data?.expenses ?? [];
  const canCreate = newLabel.trim().length > 0 && Number(newDay) >= 1 && Number(newDay) <= 31 && newAmount.trim().length > 0;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Dépenses récurrentes</h3>
          <p className="modal-subtitle">Loyer, assurances, abonnements — un montant mensuel par défaut, ajustable mois par mois.</p>
        </div>
      </div>

      <div className="table-scroll">
        <table className="shortlist-table">
          <thead>
            <tr>
              <th>Libellé</th>
              <th className="num">Jour du mois</th>
              <th className="num">Montant</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense: RecurringExpenseDto) => (
              <Fragment key={expense.id}>
                <tr className={expense.active ? "" : "settings-row-inactive"}>
                  <td>{expense.label}</td>
                  <td className="num">{expense.dayOfMonth}</td>
                  <td className="num">{formatCurrency(expense.defaultAmount)}</td>
                  <td>{expense.active ? "Active" : "Désactivée"}</td>
                  <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setOverrideOpenId(expense.id)}>
                      Ajuster un mois
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => toggleActiveMutation.mutate({ id: expense.id, active: !expense.active })}
                    >
                      {expense.active ? "Désactiver" : "Réactiver"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => {
                        if (window.confirm(`Supprimer « ${expense.label} » ?`)) deleteMutation.mutate(expense.id);
                      }}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
                {expense.overrides.length > 0 && (
                  <tr key={`${expense.id}-overrides`}>
                    <td colSpan={5} style={{ paddingTop: 0 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--gsc-color-muted)" }}>
                        {expense.overrides.map((override) => (
                          <span key={override.yearMonth}>
                            {formatYearMonth(override.yearMonth)} : {formatCurrency(override.amount)}{" "}
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => clearOverrideMutation.mutate({ id: expense.id, yearMonth: override.yearMonth })}
                            >
                              retirer
                            </button>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                {overrideOpenId === expense.id && (
                  <tr>
                    <td colSpan={5}>
                      <div className="form-grid" style={{ margin: "8px 0" }}>
                        <div className="field">
                          <label>Mois à ajuster</label>
                          <input type="month" value={overrideMonth} onChange={(e) => setOverrideMonth(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Montant ce mois-là ($)</label>
                          <input type="number" step="0.01" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} />
                        </div>
                        <div className="field field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={!overrideMonth || !overrideAmount.trim() || setOverrideMutation.isPending}
                            onClick={() => setOverrideMutation.mutate()}
                          >
                            Enregistrer l'ajustement
                          </button>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => setOverrideOpenId(null)}>
                            Annuler
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" placeholder="Libellé" style={{ maxWidth: 200 }} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <input type="number" min={1} max={31} placeholder="Jour" style={{ maxWidth: 90 }} value={newDay} onChange={(e) => setNewDay(e.target.value)} />
        <input
          type="number"
          step="0.01"
          placeholder="Montant ($, négatif = sortie)"
          style={{ maxWidth: 200 }}
          value={newAmount}
          onChange={(e) => setNewAmount(e.target.value)}
        />
        <button type="button" className="btn" disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
          + Ajouter
        </button>
      </div>
    </div>
  );
}
