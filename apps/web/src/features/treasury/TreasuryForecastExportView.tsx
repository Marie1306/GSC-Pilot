import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CompanyLetterhead } from "../../components/CompanyLetterhead.js";
import { printWhenReady } from "../../lib/printWhenReady.js";
import { fetchForecastTable, formatCurrency, type LocSweepStepDto } from "./api.js";

function formatWeekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
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
 * Export PDF du Prévisionnel de trésorerie (17 novembre 2026, demande
 * explicite de Marie) — même mécanisme que les autres vues d'export (route
 * autonome, window.print(), même source de données que l'écran —
 * fetchForecastTable, aucune nouvelle route backend). Horizon transmis par
 * l'URL (`?semaines=N`, posé par le bouton sur TreasuryForecastTable.tsx)
 * pour que l'export reflète exactement ce qui était affiché à l'écran.
 *
 * Tableau large (jusqu'à 26 colonnes) — contrairement à tous les autres
 * documents de l'appli (toujours une poignée de colonnes). Reste en
 * portrait comme le reste de l'appli (règle confirmée par Marie le 16
 * novembre 2026 — voir CLAUDE.md), avec une police et des colonnes plus
 * compactes qu'ailleurs (.treasury-export-table, theme.css) pour rester
 * lisible — confortable jusqu'à 17 semaines, plus serré au-delà (22-26) :
 * limite assumée, à revoir avec Marie si elle imprime souvent ces horizons
 * plus larges (passer en paysage serait l'option la plus simple).
 */
export function TreasuryForecastExportView() {
  const [searchParams] = useSearchParams();
  const requestedWeeks = Number(searchParams.get("semaines"));
  const weeks = HORIZON_OPTIONS.includes(requestedWeeks) ? requestedWeeks : 13;

  const forecastQuery = useQuery({ queryKey: ["treasury", "forecast", weeks], queryFn: () => fetchForecastTable(weeks) });
  const weekRows = forecastQuery.data?.weeks ?? [];

  useEffect(() => {
    if (weekRows.length === 0) return;
    return printWhenReady();
  }, [weekRows.length]);

  if (forecastQuery.isLoading) return <div style={{ padding: 40 }}>Chargement…</div>;
  if (forecastQuery.isError) return <div style={{ padding: 40 }}>Impossible de charger le prévisionnel.</div>;

  return (
    <div className="pdf-export">
      <button type="button" className="btn no-print" style={{ margin: 20 }} onClick={() => window.print()}>
        🖨️ Imprimer / Enregistrer en PDF
      </button>

      <div className="pdf-export-page pdf-export-page-wide">
        <div className="pdf-export-doc-header">
          <CompanyLetterhead />
          <div>
            <h1 className="pdf-export-doc-title">Flux de trésorerie — Prévisionnel</h1>
            <div className="pdf-export-doc-meta">
              <div>
                <span>Généré le </span>
                <strong>{formatDate(new Date().toISOString())}</strong>
              </div>
              <div>
                <span>Horizon </span>
                <strong>{weeks} semaines</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="pdf-export-doc-accent" />

        {weekRows.length === 0 ? (
          <p style={{ marginTop: 22 }}>Rien à afficher.</p>
        ) : (
          <div className="treasury-export-table-wrap">
            <table className={`treasury-export-table${weeks > 17 ? " treasury-export-table-dense" : ""}`}>
              <thead>
                <tr>
                  <th>Semaine du</th>
                  {weekRows.map((week) => (
                    <th key={week.weekStart} className="num">
                      {formatWeekLabel(week.weekStart)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Factures</td>
                  {weekRows.map((week) => (
                    <td key={week.weekStart} className="num">
                      {week.invoiceTotal !== 0 ? formatCurrency(week.invoiceTotal) : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Dépenses récurrentes</td>
                  {weekRows.map((week) => (
                    <td key={week.weekStart} className="num">
                      {week.recurringTotal !== 0 ? formatCurrency(week.recurringTotal) : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Entrées ponctuelles</td>
                  {weekRows.map((week) => (
                    <td key={week.weekStart} className="num">
                      {week.manualTotal !== 0 ? formatCurrency(week.manualTotal) : "—"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Bascule marge de crédit</td>
                  {weekRows.map((week) => (
                    <td key={week.weekStart} className="num">
                      {sweepLabel(week.sweeps)}
                    </td>
                  ))}
                </tr>
                <tr className="treasury-export-row-highlight">
                  <td>
                    <strong>Solde chèque</strong>
                  </td>
                  {weekRows.map((week) => (
                    <td key={week.weekStart} className="num">
                      <strong>{formatCurrency(week.checkingBalance)}</strong>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Marge de crédit due</td>
                  {weekRows.map((week) => (
                    <td key={week.weekStart} className="num">
                      {formatCurrency(week.locOwed)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="pdf-export-doc-footer"> </div>
      </div>
    </div>
  );
}
