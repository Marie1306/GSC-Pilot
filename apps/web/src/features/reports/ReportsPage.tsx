import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReportsOverview, formatCurrency, FINANCIAL_STATUS_LABELS } from "./api.js";
import "./reports.css";

const TYPE_LABELS: Record<string, string> = { project: "Projet", rolling: "Roulement", service_call: "Call de service" };

function formatHours(value: number | null): string {
  return value !== null ? `${value} h` : "—";
}
function formatMoneyOrDash(value: number | null): string {
  return value !== null ? formatCurrency(value) : "—";
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Rapports (20 août 2026, sur demande explicite de l'utilisatrice) —
 * agrège des chiffres déjà calculés ailleurs (voir reports/service.ts,
 * backend) : aucune nouvelle règle métier ici, seulement la mise en
 * commun. Réservé à canAccessOverviewViews (Direction/Administration/
 * Propriétaire) au niveau de la navigation — pas de vérification par
 * action ici, écran entièrement en lecture seule.
 */
export function ReportsPage() {
  const [year, setYear] = useState<number | undefined>(undefined);
  const [showDetail, setShowDetail] = useState(false);
  const overviewQuery = useQuery({ queryKey: ["reports", "overview", year], queryFn: () => fetchReportsOverview(year) });
  const overview = overviewQuery.data;

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Rapports</h1>
        <p style={{ color: "var(--gsc-color-muted)", margin: 0 }}>
          Comparatif de rentabilité entre projets, roulements et calls de service, conversion des demandes clients par canal de vente, et
          statistiques internes (Amélioration GSC).
        </p>
      </div>

      {overviewQuery.isError && (
        <div className="card" style={{ marginTop: 20 }}>
          <p className="form-error">Impossible de charger les rapports.</p>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="section-heading">
          <div>
            <h3>Comparatif de rentabilité</h3>
            <p className="modal-subtitle">Revenu, coût, marge et heures réelles — projets, roulements et calls de service confondus.</p>
          </div>
        </div>
        {!overview ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>
        ) : overview.profitability.length === 0 ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun dossier pour l'instant.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Dossier</th>
                  <th>Client</th>
                  <th className="num">Heures réelles</th>
                  <th className="num">Revenu</th>
                  <th className="num">Coût</th>
                  <th className="num">Marge</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {overview.profitability.map((row) => (
                  <tr key={`${row.type}-${row.id}`}>
                    <td>
                      <div>
                        {row.displayId !== "—" ? `${row.displayId} — ` : ""}
                        {row.label}
                      </div>
                      <div className="cell-sub">{TYPE_LABELS[row.type] ?? row.typeLabel}</div>
                    </td>
                    <td>{row.clientLabel}</td>
                    <td className="num">{formatHours(row.actualHours)}</td>
                    <td className="num">{formatCurrency(row.revenue)}</td>
                    <td className="num">{formatMoneyOrDash(row.cost)}</td>
                    <td className="num">
                      {row.grossMargin !== null ? (
                        <>
                          {formatCurrency(row.grossMargin)}
                          <div className="cell-sub">{row.grossMarginPct}%</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {row.financialStatus ? (
                        <span className={`badge-pill badge-${row.financialStatus}`}>{FINANCIAL_STATUS_LABELS[row.financialStatus]}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="section-heading">
          <div>
            <h3>Conversion par canal de vente</h3>
            <p className="modal-subtitle">Demandes clients reçues et converties (budgétaire créé) par canal, historique complet.</p>
          </div>
        </div>
        {!overview ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>
        ) : (
          <div className="channel-bar-list">
            {overview.channelConversion.map((channel) => (
              <div key={channel.salesChannelId} className="channel-bar-row">
                <div className="channel-bar-label">
                  <span>{channel.name}</span>
                  <span className="cell-sub">
                    {channel.converted} / {channel.total} converties
                  </span>
                </div>
                <div className="channel-bar-track">
                  <div className="channel-bar-fill" style={{ width: `${Math.min(100, channel.conversionPct)}%` }} />
                </div>
                <div className="channel-bar-pct">{channel.conversionPct}%</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="section-heading">
          <div>
            <h3>Statistiques internes — Amélioration GSC</h3>
            <p className="modal-subtitle">
              Heures et achats non facturables (formation, réparations internes, ménage, organisation…) — deux totaux distincts, jamais
              mélangés.
            </p>
          </div>
          {overview && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={overview.internalStats.year}
                onChange={(event) => setYear(Number(event.target.value))}
                style={{ maxWidth: 120 }}
              >
                {overview.internalStats.availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowDetail(true)}>
                Voir le détail
              </button>
            </div>
          )}
        </div>

        {overview && (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 10 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <h4 style={{ marginBottom: 8 }}>Heures internes par tâche</h4>
              {overview.internalStats.hours.tasks.length === 0 ? (
                <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune heure interne approuvée pour {overview.internalStats.year}.</p>
              ) : (
                <div className="table-scroll">
                  <table className="shortlist-table">
                    <thead>
                      <tr>
                        <th>Tâche</th>
                        <th className="num">Heures</th>
                        <th className="num">Valeur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.internalStats.hours.tasks.map((row) => (
                        <tr key={row.taskId}>
                          <td>{row.taskLabel}</td>
                          <td className="num">{formatHours(row.hours)}</td>
                          <td className="num">{formatCurrency(row.value)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <strong>Total</strong>
                        </td>
                        <td className="num">
                          <strong>{formatHours(overview.internalStats.hours.hours)}</strong>
                        </td>
                        <td className="num">
                          <strong>{formatCurrency(overview.internalStats.hours.value)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 280 }}>
              <h4 style={{ marginBottom: 8 }}>Achats internes par catégorie</h4>
              {overview.internalStats.purchases.categories.length === 0 ? (
                <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun achat interne autorisé pour {overview.internalStats.year}.</p>
              ) : (
                <div className="table-scroll">
                  <table className="shortlist-table">
                    <thead>
                      <tr>
                        <th>Catégorie</th>
                        <th className="num">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.internalStats.purchases.categories.map((row) => (
                        <tr key={row.category}>
                          <td>{row.category}</td>
                          <td className="num">{formatCurrency(row.amount)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <strong>Total</strong>
                        </td>
                        <td className="num">
                          <strong>{formatCurrency(overview.internalStats.purchases.amount)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showDetail && overview && (
        <div className="modal-backdrop" onClick={() => setShowDetail(false)}>
          <div className="modal" style={{ maxWidth: 900 }} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Détail — {overview.internalStats.year}</h2>
                <p className="modal-subtitle">Toutes les heures et tous les achats internes approuvés pour cette année.</p>
              </div>
              <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setShowDetail(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <h4 style={{ marginBottom: 8 }}>Heures détaillées</h4>
              {overview.internalStats.hours.detail.length === 0 ? (
                <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune entrée.</p>
              ) : (
                <div className="table-scroll">
                  <table className="shortlist-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Employé</th>
                        <th>Tâche</th>
                        <th className="num">Heures</th>
                        <th className="num">Valeur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.internalStats.hours.detail.map((row) => (
                        <tr key={row.id}>
                          <td>{formatDate(row.date)}</td>
                          <td>{row.employeeName}</td>
                          <td>{row.taskLabel}</td>
                          <td className="num">{formatHours(row.hours)}</td>
                          <td className="num">{formatCurrency(row.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4 style={{ marginTop: 20, marginBottom: 8 }}>Achats détaillés</h4>
              {overview.internalStats.purchases.detail.length === 0 ? (
                <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune entrée.</p>
              ) : (
                <div className="table-scroll">
                  <table className="shortlist-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Fournisseur</th>
                        <th>Catégorie</th>
                        <th className="num">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.internalStats.purchases.detail.map((row) => (
                        <tr key={row.id}>
                          <td>{formatDate(row.requestedAt)}</td>
                          <td>{row.supplier ?? "—"}</td>
                          <td>{row.categoryName}</td>
                          <td className="num">{formatCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowDetail(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
