import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { canAccessErrorReports } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchReportsOverview, formatCurrency, FINANCIAL_STATUS_LABELS, type ProfitabilityRowDto } from "./api.js";
import { fetchErrorReportsStats, fetchErrorReportSubjects } from "../errorReports/api.js";
import { ProjectPostMortem } from "../projects/ProjectPostMortem.js";
import { RollingPostMortem } from "../rollings/RollingPostMortem.js";
import { ServiceCallDetail } from "../serviceCalls/ServiceCallDetail.js";
import "./reports.css";

const MONTH_LABELS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const TYPE_LABELS: Record<string, string> = { project: "Projet", rolling: "Roulement", service_call: "Call de service" };

const PROFITABILITY_PAGE_SIZE = 10;

function formatHours(value: number | null): string {
  return value !== null ? `${value} h` : "—";
}
function formatMoneyOrDash(value: number | null): string {
  return value !== null ? formatCurrency(value) : "—";
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}
function matchesProfitabilitySearch(row: ProfitabilityRowDto, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [row.label, row.clientLabel, row.displayId].some((value) => value.toLowerCase().includes(q));
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
  const { employee } = useAuth();
  const [year, setYear] = useState<number | undefined>(undefined);
  const [showDetail, setShowDetail] = useState(false);
  // Ligne cliquable du comparatif (1er septembre 2026, demande de l'utilisatrice) :
  // Projet/Roulement ouvrent leur Post-mortem ; un Call de service n'a pas de
  // Post-mortem (confirmé, aucun n'existe pour ce module) — ouvre sa fiche à la place.
  const [activeRow, setActiveRow] = useState<{ type: ProfitabilityRowDto["type"]; id: string } | null>(null);
  const overviewQuery = useQuery({ queryKey: ["reports", "overview", year], queryFn: () => fetchReportsOverview(year) });
  const overview = overviewQuery.data;

  // Filtre/recherche/pagination du comparatif (1er septembre 2026, demande de
  // l'utilisatrice) — entièrement côté client : overview.profitability est
  // déjà chargé en entier, jamais de nouvel appel réseau pour ça.
  const [profitabilityTypeFilter, setProfitabilityTypeFilter] = useState<ProfitabilityRowDto["type"] | "">("");
  const [profitabilitySearch, setProfitabilitySearch] = useState("");
  const [profitabilityPage, setProfitabilityPage] = useState(0);
  const [profitabilityShowAll, setProfitabilityShowAll] = useState(false);

  function updateProfitabilityTypeFilter(value: string) {
    setProfitabilityTypeFilter(value as ProfitabilityRowDto["type"] | "");
    setProfitabilityPage(0);
    setProfitabilityShowAll(false);
  }
  function updateProfitabilitySearch(value: string) {
    setProfitabilitySearch(value);
    setProfitabilityPage(0);
    setProfitabilityShowAll(false);
  }

  const filteredProfitability = overview
    ? overview.profitability
        .filter((row) => !profitabilityTypeFilter || row.type === profitabilityTypeFilter)
        .filter((row) => matchesProfitabilitySearch(row, profitabilitySearch))
    : [];
  const profitabilityPageCount = Math.max(1, Math.ceil(filteredProfitability.length / PROFITABILITY_PAGE_SIZE));
  const profitabilityCurrentPage = Math.min(profitabilityPage, profitabilityPageCount - 1);
  const pagedProfitability = profitabilityShowAll
    ? filteredProfitability
    : filteredProfitability.slice(
        profitabilityCurrentPage * PROFITABILITY_PAGE_SIZE,
        (profitabilityCurrentPage + 1) * PROFITABILITY_PAGE_SIZE,
      );

  // Rapports d'erreurs (28 août 2026) — section plus restrictive que le
  // reste de cette page : canAccessErrorReports (Propriétaire/Direction)
  // est un sous-ensemble de canAccessOverviewViews qui gate déjà toute la
  // page (nav.ts) — Administration voit le reste de Rapports mais jamais
  // cette section, donc requête séparée activée seulement pour les rôles
  // autorisés plutôt que de l'inclure dans /reports/overview.
  const canSeeErrorReports = !!employee && canAccessErrorReports(employee.persona);
  const [errorReportsMonth, setErrorReportsMonth] = useState<number | undefined>(undefined);
  const [errorReportsYear, setErrorReportsYear] = useState<number | undefined>(undefined);
  const [errorReportsEmployeeId, setErrorReportsEmployeeId] = useState<string>("");
  const errorReportsStatsQuery = useQuery({
    queryKey: ["error-reports", "stats", errorReportsMonth, errorReportsYear, errorReportsEmployeeId],
    queryFn: () =>
      fetchErrorReportsStats({ month: errorReportsMonth, year: errorReportsYear, employeeId: errorReportsEmployeeId || undefined }),
    enabled: canSeeErrorReports,
  });
  const errorReportSubjectsQuery = useQuery({
    queryKey: ["error-reports", "subjects"],
    queryFn: fetchErrorReportSubjects,
    enabled: canSeeErrorReports,
  });
  const errorReportsStats = errorReportsStatsQuery.data;
  const errorReportSubjects = errorReportSubjectsQuery.data?.employees ?? [];

  return (
    <div>
      {overviewQuery.isError && (
        <div className="card">
          <p className="form-error">Impossible de charger les rapports.</p>
        </div>
      )}

      <div className="card" style={{ marginTop: overviewQuery.isError ? 20 : 0 }}>
        <div className="card-band-header">
          <div>
            <h3>Comparatif de rentabilité</h3>
            <p className="modal-subtitle">Revenu, coût, marge et heures réelles — projets, roulements et calls de service confondus.</p>
          </div>
        </div>

        {overview && overview.profitability.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "14px 0" }}>
            <select value={profitabilityTypeFilter} onChange={(event) => updateProfitabilityTypeFilter(event.target.value)} style={{ maxWidth: 200 }}>
              <option value="">Tous les types</option>
              <option value="project">{TYPE_LABELS.project}</option>
              <option value="rolling">{TYPE_LABELS.rolling}</option>
              <option value="service_call">{TYPE_LABELS.service_call}</option>
            </select>
            <input
              type="search"
              placeholder="Rechercher par dossier ou client…"
              value={profitabilitySearch}
              onChange={(event) => updateProfitabilitySearch(event.target.value)}
              style={{ maxWidth: 260 }}
            />
          </div>
        )}

        {!overview ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>
        ) : overview.profitability.length === 0 ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun dossier pour l'instant.</p>
        ) : filteredProfitability.length === 0 ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun résultat pour ce filtre ou cette recherche.</p>
        ) : (
          <>
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
                  {pagedProfitability.map((row) => (
                    <tr key={`${row.type}-${row.id}`} className="clickable-row" onClick={() => setActiveRow({ type: row.type, id: row.id })}>
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

            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
              <span style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>
                {filteredProfitability.length} dossier{filteredProfitability.length > 1 ? "s" : ""}
              </span>
              {!profitabilityShowAll && profitabilityPageCount > 1 && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={profitabilityCurrentPage === 0}
                    onClick={() => setProfitabilityPage((p) => p - 1)}
                  >
                    Précédent
                  </button>
                  <span style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>
                    Page {profitabilityCurrentPage + 1} / {profitabilityPageCount}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={profitabilityCurrentPage >= profitabilityPageCount - 1}
                    onClick={() => setProfitabilityPage((p) => p + 1)}
                  >
                    Suivant
                  </button>
                </>
              )}
              {!profitabilityShowAll && filteredProfitability.length > PROFITABILITY_PAGE_SIZE && (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setProfitabilityShowAll(true)}>
                  Voir tout
                </button>
              )}
              {profitabilityShowAll && (
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setProfitabilityShowAll(false);
                    setProfitabilityPage(0);
                  }}
                >
                  Réduire
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-band-header">
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
        <div className="card-band-header">
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

      {canSeeErrorReports && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-band-header">
            <div>
              <h3>Rapports d'erreurs</h3>
              <p className="modal-subtitle">Valeur du matériel en erreur et valeur des heures perdues (temps et $), filtrable mois/année/employé.</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <select
              value={errorReportsMonth ?? ""}
              onChange={(event) => setErrorReportsMonth(event.target.value ? Number(event.target.value) : undefined)}
              style={{ maxWidth: 170 }}
            >
              <option value="">Tous les mois</option>
              {MONTH_LABELS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={errorReportsYear ?? ""}
              onChange={(event) => setErrorReportsYear(event.target.value ? Number(event.target.value) : undefined)}
              style={{ maxWidth: 130 }}
            >
              <option value="">Toutes les années</option>
              {(errorReportsStats?.availableYears ?? []).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select value={errorReportsEmployeeId} onChange={(event) => setErrorReportsEmployeeId(event.target.value)} style={{ maxWidth: 200 }}>
              <option value="">Tous les employés</option>
              {errorReportSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>

          {!errorReportsStats ? (
            <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>
          ) : (
            <div className="stat-tile-grid">
              <div className="stat-tile">
                <span className="stat-tile-label">Rapports</span>
                <span className="stat-tile-value">{errorReportsStats.reportCount}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-label">Valeur matériel</span>
                <span className="stat-tile-value">{formatCurrency(errorReportsStats.totalMaterialValue)}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-label">Heures perdues</span>
                <span className="stat-tile-value">{errorReportsStats.totalHoursLost} h</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-label">Valeur des heures</span>
                <span className="stat-tile-value">{formatCurrency(errorReportsStats.totalHoursValue)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {activeRow?.type === "project" && <ProjectPostMortem projectId={activeRow.id} onClose={() => setActiveRow(null)} />}
      {activeRow?.type === "rolling" && <RollingPostMortem id={activeRow.id} onClose={() => setActiveRow(null)} />}
      {activeRow?.type === "service_call" && <ServiceCallDetail id={activeRow.id} onClose={() => setActiveRow(null)} />}

      {showDetail && overview && (
        <div className="modal-backdrop">
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
