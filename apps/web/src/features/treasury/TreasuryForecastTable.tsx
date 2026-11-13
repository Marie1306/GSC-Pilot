import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchForecastTable, formatCurrency, type ForecastWeekRowDto, type LocSweepStepDto } from "./api.js";

function formatWeekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
}

function invoiceDetailTitle(week: ForecastWeekRowDto): string | undefined {
  if (week.invoiceDetails.length === 0) return undefined;
  return week.invoiceDetails.map((d) => `${d.invoiceNumber} — ${d.sourceLabel} (${d.clientLabel}) : ${formatCurrency(d.amount)}`).join("\n");
}

function recurringDetailTitle(week: ForecastWeekRowDto): string | undefined {
  if (week.recurringDetails.length === 0) return undefined;
  return week.recurringDetails.map((d) => `${d.label} : ${formatCurrency(d.amount)}`).join("\n");
}

function manualDetailTitle(week: ForecastWeekRowDto): string | undefined {
  if (week.manualDetails.length === 0) return undefined;
  return week.manualDetails.map((d) => `${d.label} : ${formatCurrency(d.amount)}`).join("\n");
}

function sweepLabel(sweeps: LocSweepStepDto[]): string {
  if (sweeps.length === 0) return "—";
  const draws = sweeps.filter((s) => s.direction === "draw");
  const repays = sweeps.filter((s) => s.direction === "repay");
  const parts: string[] = [];
  if (draws.length > 0) parts.push(`+${formatCurrency(draws.reduce((sum, s) => sum + s.amount, 0))}`);
  if (repays.length > 0) parts.push(`-${formatCurrency(repays.reduce((sum, s) => sum + s.amount, 0))}`);
  return parts.join(" · ");
}

const HORIZON_OPTIONS = [13, 17, 22, 26];

/**
 * Tableau prévisionnel 13 semaines par défaut / jusqu'à 26 (~6 mois)
 * modifiable — toute la logique (bascule, dépenses récurrentes, ré-bascule
 * au paiement) vit déjà côté serveur (treasury/service.ts →
 * buildForecastTable, business-rules). Survol des cellules Factures/
 * Dépenses récurrentes/Entrées ponctuelles : seul idiome de détail
 * disponible dans ce frontend (attribut title natif, confirmé par grep
 * exhaustif) — jamais sur les lignes de solde courant (Solde chèque/Marge
 * due), qui n'ont pas de notion d'éléments inclus. "Solde chèque" en gris
 * (13 novembre 2026, demandé par Marie) pour bien le distinguer des
 * autres lignes.
 */
export function TreasuryForecastTable() {
  const [weekCount, setWeekCount] = useState(13);
  const forecastQuery = useQuery({ queryKey: ["treasury", "forecast", weekCount], queryFn: () => fetchForecastTable(weekCount) });
  const weeks = forecastQuery.data?.weeks ?? [];

  return (
    <div className="card">
      <div className="card-band-header">
        <div>
          <h3>Prévisionnel</h3>
          <p className="modal-subtitle">Survolez un montant de facturation, de dépense récurrente ou d'entrée ponctuelle pour voir son détail.</p>
        </div>
        <select value={weekCount} onChange={(event) => setWeekCount(Number(event.target.value))} style={{ maxWidth: 160 }}>
          {HORIZON_OPTIONS.map((count) => (
            <option key={count} value={count}>
              {count} semaines
            </option>
          ))}
        </select>
      </div>

      {forecastQuery.isError ? (
        <p className="form-error">Impossible de charger le prévisionnel.</p>
      ) : weeks.length === 0 ? (
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>{forecastQuery.isLoading ? "Chargement…" : "Rien à afficher."}</p>
      ) : (
        <div className="table-scroll">
          <table className="shortlist-table">
            <thead>
              <tr>
                <th>Semaine du</th>
                {weeks.map((week) => (
                  <th key={week.weekStart} className="num">
                    {formatWeekLabel(week.weekStart)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Factures</td>
                {weeks.map((week) => (
                  <td key={week.weekStart} className="num" title={invoiceDetailTitle(week)}>
                    {week.invoiceTotal !== 0 ? formatCurrency(week.invoiceTotal) : "—"}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Dépenses récurrentes</td>
                {weeks.map((week) => (
                  <td key={week.weekStart} className={`num ${week.recurringTotal < 0 ? "over-budget" : ""}`} title={recurringDetailTitle(week)}>
                    {week.recurringTotal !== 0 ? formatCurrency(week.recurringTotal) : "—"}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Entrées ponctuelles</td>
                {weeks.map((week) => (
                  <td key={week.weekStart} className={`num ${week.manualTotal < 0 ? "over-budget" : ""}`} title={manualDetailTitle(week)}>
                    {week.manualTotal !== 0 ? formatCurrency(week.manualTotal) : "—"}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Bascule marge de crédit</td>
                {weeks.map((week) => (
                  <td key={week.weekStart} className="num">
                    {sweepLabel(week.sweeps)}
                  </td>
                ))}
              </tr>
              <tr style={{ background: "var(--gsc-color-surface2)" }}>
                <td>
                  <strong>Solde chèque</strong>
                </td>
                {weeks.map((week) => (
                  <td key={week.weekStart} className={`num ${week.checkingBalance < 0 ? "over-budget" : ""}`}>
                    <strong>{formatCurrency(week.checkingBalance)}</strong>
                  </td>
                ))}
              </tr>
              <tr>
                <td>Marge de crédit due</td>
                {weeks.map((week) => (
                  <td key={week.weekStart} className="num">
                    {formatCurrency(week.locOwed)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
