import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManagePostMortem } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import {
  fetchPostMortem,
  updatePostMortemAnalysis,
  fetchApprovedTimeEntries,
  formatCurrency,
  FINANCIAL_STATUS_LABELS,
} from "./api.js";
import { ApprovedPurchasesDrilldown } from "./ApprovedPurchasesDrilldown.js";

interface ProjectPostMortemProps {
  projectId: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Post-mortem (Projet 2E, 17 août 2026) — confirmé le même écran que celui
 * qu'utilisera le futur module Rapports (sélection d'un projet dans les
 * rapports post-mortem), donc construit comme une vue autonome, jamais
 * couplée à la mécanique propre de ProjectDetail. Tous les chiffres sauf
 * l'Analyse finale réutilisent exactement les mêmes calculs que le reste du
 * module Projet (computeProjectFinancials, service.ts) — rien recalculé
 * différemment. Comparatif main-d'oeuvre détaillé par tâche à l'intérieur de
 * chaque catégorie depuis le 24 août 2026 (demandé par l'utilisatrice —
 * PunchableTask joint via BudgetRow.modelRowId). ProjectDetail.tsx affiche
 * volontairement le même comparatif SANS le détail par tâche (confirmé
 * "parfait" ainsi par l'utilisatrice) — jamais une deuxième formule,
 * seulement un rendu différent du même champ optionnel `tasks`. Le bloc "Heures
 * planifiées et réelles" en barres de la référence v19 est volontairement
 * omis ici — mêmes données que le Comparatif ci-dessous, pas de deuxième
 * visualisation redondante pour cette première version.
 */
export function ProjectPostMortem({ projectId, onClose }: ProjectPostMortemProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["post-mortem", projectId], queryFn: () => fetchPostMortem(projectId) });
  const postMortem = detailQuery.data?.postMortem;

  const [showHoursDrilldown, setShowHoursDrilldown] = useState(false);
  const hoursQuery = useQuery({
    queryKey: ["approved-hours", projectId],
    queryFn: () => fetchApprovedTimeEntries(projectId),
    enabled: showHoursDrilldown,
  });

  const [depassements, setDepassements] = useState<string | null>(null);
  const [ameliorations, setAmeliorations] = useState<string | null>(null);
  const [recommandation, setRecommandation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      updatePostMortemAnalysis(projectId, {
        depassements: depassements ?? postMortem?.postMortemDepassements ?? "",
        ameliorations: ameliorations ?? postMortem?.postMortemAmeliorations ?? "",
        recommandation: recommandation ?? postMortem?.postMortemRecommandation ?? "",
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["post-mortem", projectId] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  if (!employee) return null;
  const canManage = canManagePostMortem(employee.persona);

  const hasAnalysis = !!(postMortem?.postMortemDepassements || postMortem?.postMortemAmeliorations || postMortem?.postMortemRecommandation);
  const totalPlanned = postMortem?.costBreakdown?.reduce((sum, row) => sum + row.planned, 0) ?? 0;
  const totalActual = postMortem?.costBreakdown?.reduce((sum, row) => sum + row.actual, 0) ?? 0;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <div>
            <h2>{postMortem ? `Post-mortem — ${postMortem.projectNumber}` : "Post-mortem"}</h2>
            {postMortem && <p className="modal-subtitle">{postMortem.name} · comparaison budgétaire et réel</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!postMortem && <p>Chargement…</p>}
          {postMortem && (
            <>
              <div className="stat-tile-grid">
                {postMortem.sold !== undefined && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Prix vendu</span>
                    <span className="stat-tile-value">{formatCurrency(postMortem.sold)}</span>
                  </div>
                )}
                <div className="stat-tile">
                  <span className="stat-tile-label">Heures planifiées</span>
                  <span className="stat-tile-value">{postMortem.plannedHours} h</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Heures réelles</span>
                  <span className="stat-tile-value">{postMortem.actualHours} h</span>
                </div>
                {postMortem.plannedPurchases !== undefined && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Achats planifiés</span>
                    <span className="stat-tile-value">{formatCurrency(postMortem.plannedPurchases)}</span>
                  </div>
                )}
                {postMortem.actualPurchases !== undefined && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Achats réels</span>
                    <span className="stat-tile-value">{formatCurrency(postMortem.actualPurchases)}</span>
                  </div>
                )}
                {postMortem.grossMargin !== undefined && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Marge brute</span>
                    <span className="stat-tile-value">
                      {formatCurrency(postMortem.grossMargin)} · {postMortem.grossMarginPct} %
                    </span>
                  </div>
                )}
              </div>

              {postMortem.comparatif.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 4 }}>Comparatif main-d'oeuvre</h3>
                  <p style={{ margin: "0 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
                    Par catégorie, détaillé par tâche — les valeurs réelles deviennent rouges uniquement lorsqu'elles dépassent le
                    planifié.
                  </p>
                  <div style={{ overflowX: "auto" }}>
                    <table className="comparatif-table">
                      <thead>
                        <tr>
                          <th>Catégorie</th>
                          <th>H planifiées</th>
                          <th>H réelles</th>
                          <th>Écart H</th>
                          {postMortem.comparatif[0]?.plannedCost !== undefined && (
                            <>
                              <th>Coût planifié</th>
                              <th>Coût réel</th>
                              <th>Écart $</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {postMortem.comparatif.map((row) => (
                          <Fragment key={row.category}>
                            <tr>
                              <td>
                                <strong>{row.categoryLabel}</strong>
                              </td>
                              <td>{row.plannedHours} h</td>
                              <td className={row.hoursDelta > 0 ? "over-budget" : ""}>{row.actualHours} h</td>
                              <td className={row.hoursDelta > 0 ? "over-budget" : ""}>
                                {row.hoursDelta > 0 ? "+" : ""}
                                {row.hoursDelta} h
                              </td>
                              {row.plannedCost !== undefined && (
                                <>
                                  <td>{formatCurrency(row.plannedCost)}</td>
                                  <td className={(row.costDelta ?? 0) > 0 ? "over-budget" : ""}>{formatCurrency(row.actualCost ?? 0)}</td>
                                  <td className={(row.costDelta ?? 0) > 0 ? "over-budget" : ""}>
                                    {(row.costDelta ?? 0) > 0 ? "+" : ""}
                                    {formatCurrency(row.costDelta ?? 0)}
                                  </td>
                                </>
                              )}
                            </tr>
                            {row.tasks?.map((task) => (
                              <tr key={task.taskId} className="comparatif-task-row">
                                <td>{task.taskLabel}</td>
                                <td>{task.plannedHours} h</td>
                                <td className={task.hoursDelta > 0 ? "over-budget" : ""}>{task.actualHours} h</td>
                                <td className={task.hoursDelta > 0 ? "over-budget" : ""}>
                                  {task.hoursDelta > 0 ? "+" : ""}
                                  {task.hoursDelta} h
                                </td>
                                {task.plannedCost !== undefined && (
                                  <>
                                    <td>{formatCurrency(task.plannedCost)}</td>
                                    <td className={(task.costDelta ?? 0) > 0 ? "over-budget" : ""}>{formatCurrency(task.actualCost ?? 0)}</td>
                                    <td className={(task.costDelta ?? 0) > 0 ? "over-budget" : ""}>
                                      {(task.costDelta ?? 0) > 0 ? "+" : ""}
                                      {formatCurrency(task.costDelta ?? 0)}
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 4, marginBottom: showHoursDrilldown ? 12 : 20 }}>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowHoursDrilldown((v) => !v)}>
                  🕒 {showHoursDrilldown ? "Masquer le détail des heures" : "Détail des heures approuvées"}
                </button>
              </div>
              {showHoursDrilldown && (
                <div style={{ overflowX: "auto", marginBottom: 20 }}>
                  {hoursQuery.isLoading && <p style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Chargement…</p>}
                  {hoursQuery.data && hoursQuery.data.entries.length === 0 && (
                    <p style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Aucune heure approuvée.</p>
                  )}
                  {hoursQuery.data && hoursQuery.data.entries.length > 0 && (
                    <table className="shortlist-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Employé</th>
                          <th>Catégorie</th>
                          <th>Tâche</th>
                          <th className="num">Heures</th>
                          {hoursQuery.data.entries[0]?.cost !== undefined && <th className="num">Coût</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {hoursQuery.data.entries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDate(entry.date)}</td>
                            <td>{entry.employeeName}</td>
                            <td>{entry.category}</td>
                            <td>{entry.taskLabel}</td>
                            <td className="num">{entry.hours} h</td>
                            {entry.cost !== undefined && <td className="num">{formatCurrency(entry.cost)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div className="card">
                  <strong>Réserves budgétaires</strong>
                  <p style={{ margin: "4px 0 10px", fontSize: 13, color: "var(--gsc-color-muted)" }}>
                    Distinctes des tâches et des achats — ni punchables ni consommées dans le Gantt.
                  </p>
                  <div className="stat-tile-grid" style={{ marginBottom: 0 }}>
                    <div className="stat-tile">
                      <span className="stat-tile-label">Back-up d'heures</span>
                      <span className="stat-tile-value">
                        {postMortem.backupHours} h{postMortem.backupHoursCost !== undefined && <> · {formatCurrency(postMortem.backupHoursCost)}</>}
                      </span>
                    </div>
                    {postMortem.projectBackupAmount !== undefined && (
                      <div className="stat-tile">
                        <span className="stat-tile-label">Back-up projet</span>
                        <span className="stat-tile-value">{formatCurrency(postMortem.projectBackupAmount)}</span>
                      </div>
                    )}
                  </div>
                </div>
                {postMortem.plannedPurchases !== undefined && postMortem.actualPurchases !== undefined && (
                  <div className="card">
                    <strong>Achats</strong>
                    <p style={{ margin: "4px 0 10px", fontSize: 13, color: "var(--gsc-color-muted)" }}>
                      Toutes les sources approuvées, combinées et dédupliquées par référence d'origine.
                    </p>
                    <div className="stat-tile-grid" style={{ marginBottom: 0 }}>
                      <div className="stat-tile">
                        <span className="stat-tile-label">Planifié</span>
                        <span className="stat-tile-value">{formatCurrency(postMortem.plannedPurchases)}</span>
                      </div>
                      <div className="stat-tile">
                        <span className="stat-tile-label">Réel approuvé</span>
                        <span className="stat-tile-value">{formatCurrency(postMortem.actualPurchases)}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <ApprovedPurchasesDrilldown projectId={projectId} />
                    </div>
                  </div>
                )}
              </div>

              {postMortem.costBreakdown && (
                <div style={{ marginBottom: 20, overflowX: "auto" }}>
                  <h3 style={{ fontSize: 15, marginBottom: 10 }}>Coûts planifiés et réels</h3>
                  <table className="shortlist-table">
                    <thead>
                      <tr>
                        <th>Coût</th>
                        <th className="num">Planifié</th>
                        <th className="num">Réel</th>
                        <th className="num">Écart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {postMortem.costBreakdown.map((row) => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td className="num">{formatCurrency(row.planned)}</td>
                          <td className="num">{formatCurrency(row.actual)}</td>
                          <td className={`num ${row.actual > row.planned ? "over-budget" : ""}`}>{formatCurrency(row.actual - row.planned)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <strong>Total</strong>
                        </td>
                        <td className="num">
                          <strong>{formatCurrency(totalPlanned)}</strong>
                        </td>
                        <td className="num">
                          <strong>{formatCurrency(totalActual)}</strong>
                        </td>
                        <td className={`num ${totalActual > totalPlanned ? "over-budget" : ""}`}>
                          <strong>{formatCurrency(totalActual - totalPlanned)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {postMortem.financialStatus && (
                <div className={`financial-banner financial-banner-${postMortem.financialStatus}`} style={{ marginBottom: 20 }}>
                  <strong>{FINANCIAL_STATUS_LABELS[postMortem.financialStatus]}</strong>
                  <p>
                    Prix vendu {formatCurrency(postMortem.sold ?? 0)} − coûts réels {formatCurrency(totalActual)} = marge réelle{" "}
                    {formatCurrency(postMortem.grossMargin ?? 0)} · {postMortem.grossMarginPct} %
                  </p>
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, marginBottom: 10 }}>Analyse finale</h3>
                {!canManage && !hasAnalysis && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune analyse enregistrée.</p>}
                <div className="form-grid">
                  <div className="field field-full">
                    <label>Principaux dépassements</label>
                    <textarea
                      rows={3}
                      value={depassements ?? postMortem.postMortemDepassements ?? ""}
                      disabled={!canManage}
                      onChange={(e) => setDepassements(e.target.value)}
                    />
                  </div>
                  <div className="field field-full">
                    <label>Améliorations GSC / leçons apprises</label>
                    <textarea
                      rows={3}
                      value={ameliorations ?? postMortem.postMortemAmeliorations ?? ""}
                      disabled={!canManage}
                      onChange={(e) => setAmeliorations(e.target.value)}
                    />
                  </div>
                  <div className="field field-full">
                    <label>Recommandation pour un prochain budgétaire</label>
                    <textarea
                      rows={3}
                      value={recommandation ?? postMortem.postMortemRecommandation ?? ""}
                      disabled={!canManage}
                      onChange={(e) => setRecommandation(e.target.value)}
                    />
                  </div>
                </div>
                {error && <p className="form-error">{error}</p>}
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                    style={{ marginTop: 8 }}
                  >
                    {saveMutation.isPending ? "…" : "Enregistrer l'analyse"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="btn btn-secondary" disabled title="Export PDF — hors scope pour l'instant (confirmé)">
            📄 Exporter PDF avec modèle (bientôt)
          </button>
        </div>
      </div>
    </div>
  );
}
