import { Fragment, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth/useAuth.js";
import { printWhenReady } from "../../lib/printWhenReady.js";
import { fetchRollingPostMortem, formatCurrency, FINANCIAL_STATUS_LABELS } from "./api.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Vue d'export PDF du Post-mortem Roulement (15 novembre 2026, demande de
 * l'utilisatrice — RollingPostMortem.tsx n'avait jamais eu de bouton
 * d'export, contrairement à son équivalent Projet construit le 1er
 * septembre 2026). Même mécanisme et même gabarit que
 * ProjectPostMortemExportView.tsx (classes pdf-export-* partagées,
 * window.print() via printWhenReady) — aucun chiffre recalculé, tout
 * vient de fetchRollingPostMortem (même fonction que la vue interactive).
 * Pas de section Back-up (un roulement n'en a pas, voir RollingPostMortem.tsx)
 * ni de détail par tâche dans le comparatif (jamais disponible pour un
 * roulement — row.tasks reste undefined, le même rendu que la version
 * Projet s'en passe déjà via l'optional chaining).
 */
export function RollingPostMortemExportView() {
  const { id } = useParams<{ id: string }>();
  const { employee } = useAuth();
  const detailQuery = useQuery({
    queryKey: ["rolling", id, "post-mortem"],
    queryFn: () => fetchRollingPostMortem(id!),
    enabled: !!id,
  });
  const postMortem = detailQuery.data?.postMortem;

  useEffect(() => {
    if (!postMortem) return;
    return printWhenReady();
  }, [postMortem]);

  if (!id) return null;
  if (!postMortem) return <div style={{ padding: 40 }}>{detailQuery.isError ? "Post-mortem introuvable." : "Chargement…"}</div>;

  const totalPlanned = postMortem.costBreakdown?.reduce((sum, row) => sum + row.planned, 0) ?? 0;
  const totalActual = postMortem.costBreakdown?.reduce((sum, row) => sum + row.actual, 0) ?? 0;
  const hasAnalysis = !!(postMortem.postMortemDepassements || postMortem.postMortemAmeliorations || postMortem.postMortemRecommandation);

  return (
    <div className="pdf-export">
      <button type="button" className="btn no-print" style={{ margin: 20 }} onClick={() => window.print()}>
        🖨️ Imprimer / Enregistrer en PDF
      </button>

      <div className="pdf-export-page">
        <header className="pdf-export-header">
          <div>
            <div className="pdf-export-brand">GSC Automation — Post-mortem {postMortem.rollingNumber}</div>
            <p>
              <strong>Client :</strong> {postMortem.company ?? postMortem.contactName}
            </p>
          </div>
          {postMortem.financialStatus && <div className="pdf-export-status">{FINANCIAL_STATUS_LABELS[postMortem.financialStatus]}</div>}
        </header>

        <div className="pdf-export-summary">
          {postMortem.sold !== undefined && (
            <div className="pdf-export-box">
              <span>Prix vendu</span>
              <strong>{formatCurrency(postMortem.sold)}</strong>
            </div>
          )}
          <div className="pdf-export-box">
            <span>Heures planifiées</span>
            <strong>{postMortem.plannedHours} h</strong>
          </div>
          <div className="pdf-export-box">
            <span>Heures réelles</span>
            <strong>{postMortem.actualHours} h</strong>
          </div>
          {postMortem.plannedPurchases !== undefined && (
            <div className="pdf-export-box">
              <span>Achats planifiés</span>
              <strong>{formatCurrency(postMortem.plannedPurchases)}</strong>
            </div>
          )}
          {postMortem.actualPurchases !== undefined && (
            <div className="pdf-export-box">
              <span>Achats réels</span>
              <strong>{formatCurrency(postMortem.actualPurchases)}</strong>
            </div>
          )}
          {postMortem.grossMargin !== undefined && (
            <div className="pdf-export-box">
              <span>Marge brute</span>
              <strong>
                {formatCurrency(postMortem.grossMargin)} · {postMortem.grossMarginPct} %
              </strong>
            </div>
          )}
        </div>

        {postMortem.comparatif.length > 0 && (
          <section className="pdf-export-section">
            <h2>Comparatif planifié vs réel</h2>
            <p>Par catégorie — les valeurs réelles en gras dépassent le planifié.</p>
            <table>
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
                      <tr key={task.taskId}>
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
          </section>
        )}

        {postMortem.costBreakdown && (
          <section className="pdf-export-section">
            <h2>Coûts planifiés et réels</h2>
            <table>
              <thead>
                <tr>
                  <th>Coût</th>
                  <th>Planifié</th>
                  <th>Réel</th>
                  <th>Écart</th>
                </tr>
              </thead>
              <tbody>
                {postMortem.costBreakdown.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{formatCurrency(row.planned)}</td>
                    <td className={row.actual > row.planned ? "over-budget" : ""}>{formatCurrency(row.actual)}</td>
                    <td className={row.actual > row.planned ? "over-budget" : ""}>{formatCurrency(row.actual - row.planned)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th>{formatCurrency(totalPlanned)}</th>
                  <th className={totalActual > totalPlanned ? "over-budget" : ""}>{formatCurrency(totalActual)}</th>
                  <th className={totalActual > totalPlanned ? "over-budget" : ""}>{formatCurrency(totalActual - totalPlanned)}</th>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {hasAnalysis && (
          <div className="pdf-export-notes">
            <strong>Principaux dépassements</strong>
            <p>{postMortem.postMortemDepassements || "—"}</p>
            <strong>Améliorations GSC / leçons apprises</strong>
            <p>{postMortem.postMortemAmeliorations || "—"}</p>
            <strong>Recommandation pour un prochain budgétaire</strong>
            <p>{postMortem.postMortemRecommandation || "—"}</p>
          </div>
        )}

        <footer className="pdf-export-footer">
          Exporté le {formatDate(new Date().toISOString())}
          {employee && <> par {employee.name}</>} — GSC Pilot
        </footer>
      </div>
    </div>
  );
}
