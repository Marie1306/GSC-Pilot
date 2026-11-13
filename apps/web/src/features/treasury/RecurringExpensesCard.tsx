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
  WEEKDAY_LABELS,
  type RecurringExpenseDto,
  type RecurringExpenseFrequency,
} from "./api.js";

function formatYearMonth(yearMonth: string): string {
  return new Date(`${yearMonth}-01T00:00:00`).toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
}

function frequencyLabel(expense: RecurringExpenseDto): string {
  return expense.frequency === "weekly" ? `Chaque ${WEEKDAY_LABELS[expense.dayOfWeek ?? 1]}` : `Le ${expense.dayOfMonth} de chaque mois`;
}

/**
 * Dépenses récurrentes (loyer, assurances, salaires, etc.) — toujours un
 * montant POSITIF (confirmé 13 novembre 2026 : "une dépense récurrente est
 * une sortie de fonds", jamais de convention de signe ici) appliqué chaque
 * mois (au jour choisi) ou chaque semaine (ex. salaires), avec possibilité
 * de corriger le montant d'UN mois précis (override, mensuel seulement —
 * jamais pour une dépense hebdomadaire) sans toucher aux autres mois.
 */
export function RecurringExpensesCard() {
  const queryClient = useQueryClient();
  const expensesQuery = useQuery({ queryKey: ["treasury", "recurring-expenses"], queryFn: fetchRecurringExpenses });
  const [newLabel, setNewLabel] = useState("");
  const [newFrequency, setNewFrequency] = useState<RecurringExpenseFrequency>("monthly");
  const [newDayOfMonth, setNewDayOfMonth] = useState("1");
  const [newDayOfWeek, setNewDayOfWeek] = useState("1");
  const [newAmount, setNewAmount] = useState("");
  const [overrideOpenId, setOverrideOpenId] = useState<string | null>(null);
  const [overrideMonth, setOverrideMonth] = useState("");
  const [overrideAmount, setOverrideAmount] = useState("");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["treasury"] });

  const createMutation = useMutation({
    mutationFn: () =>
      createRecurringExpense({
        label: newLabel.trim(),
        frequency: newFrequency,
        dayOfMonth: newFrequency === "monthly" ? Number(newDayOfMonth) : undefined,
        dayOfWeek: newFrequency === "weekly" ? Number(newDayOfWeek) : undefined,
        defaultAmount: Number(newAmount),
      }),
    onSuccess: () => {
      setNewLabel("");
      setNewFrequency("monthly");
      setNewDayOfMonth("1");
      setNewDayOfWeek("1");
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
  const canCreate =
    newLabel.trim().length > 0 &&
    newAmount.trim().length > 0 &&
    Number(newAmount) > 0 &&
    (newFrequency === "monthly" ? Number(newDayOfMonth) >= 1 && Number(newDayOfMonth) <= 31 : Number(newDayOfWeek) >= 1 && Number(newDayOfWeek) <= 7);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Dépenses récurrentes</h3>
          <p className="modal-subtitle">
            Loyer, assurances, salaires — toujours un montant positif (une sortie de fonds), mensuel ou hebdomadaire, ajustable mois par mois pour une
            dépense mensuelle.
          </p>
        </div>
      </div>

      <div className="table-scroll">
        <table className="shortlist-table">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Fréquence</th>
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
                  <td>{frequencyLabel(expense)}</td>
                  <td className="num">{formatCurrency(expense.defaultAmount)}</td>
                  <td>{expense.active ? "Active" : "Désactivée"}</td>
                  <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {expense.frequency === "monthly" && (
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => setOverrideOpenId(expense.id)}>
                        Ajuster un mois
                      </button>
                    )}
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
                  <tr>
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
                          <input type="number" min={0.01} step="0.01" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} />
                        </div>
                        <div className="field field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={!overrideMonth || !(Number(overrideAmount) > 0) || setOverrideMutation.isPending}
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
        <input type="text" placeholder="Libellé" style={{ maxWidth: 160 }} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <select value={newFrequency} onChange={(e) => setNewFrequency(e.target.value as RecurringExpenseFrequency)} style={{ maxWidth: 140 }}>
          <option value="monthly">Mensuelle</option>
          <option value="weekly">Hebdomadaire</option>
        </select>
        {newFrequency === "monthly" ? (
          <input
            type="number"
            min={1}
            max={31}
            placeholder="Jour du mois"
            style={{ maxWidth: 110 }}
            value={newDayOfMonth}
            onChange={(e) => setNewDayOfMonth(e.target.value)}
          />
        ) : (
          <select value={newDayOfWeek} onChange={(e) => setNewDayOfWeek(e.target.value)} style={{ maxWidth: 140 }}>
            {Object.entries(WEEKDAY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
        <input type="number" min={0.01} step="0.01" placeholder="Montant ($)" style={{ maxWidth: 140 }} value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
        <button type="button" className="btn" disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
          + Ajouter
        </button>
      </div>
    </div>
  );
}
