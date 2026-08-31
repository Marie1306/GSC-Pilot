import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManagePostMortem } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchRollingPostMortem, updateRollingPostMortem, formatCurrency, FINANCIAL_STATUS_LABELS } from "./api.js";

interface RollingPostMortemProps {
  id: string;
  onClose: () => void;
}

/**
 * Post-mortem d'un roulement (spec confirmée : « la livraison termine le
 * roulement → statut "Terminé" → apparaît au Post-mortem »). Depuis le 1er
 * septembre 2026 (demande de l'utilisatrice — même niveau de détail que le
 * Post-mortem Projet), réutilise exactement les mêmes chiffres que
 * RollingDetail.tsx (computeRollingFinancials, rollings/service.ts) : tuiles,
 * comparatif planifié/réel par catégorie, répartition des coûts, bandeau de
 * statut financier. AUCUNE carte back-up (contrairement à ProjectPostMortem —
 * pas de taux back-up sur un roulement) et AUCUN détail par tâche dans le
 * comparatif (jamais demandé ni disponible pour un roulement).
 */
export function RollingPostMortem({ id, onClose }: RollingPostMortemProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["rolling", id, "post-mortem"], queryFn: () => fetchRollingPostMortem(id) });
  const postMortem = detailQuery.data?.postMortem;

  const [depassements, setDepassements] = useState<string | null>(null);
  const [ameliorations, setAmeliorations] = useState<string | null>(null);
  const [recommandation, setRecommandation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: { depassements?: string; ameliorations?: string; recommandation?: string }) => updateRollingPostMortem(id, input),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["rolling", id, "post-mortem"] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  if (!employee) return null;
  const canManage = canManagePostMortem(employee.persona);

  if (!postMortem) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="modal-body">{detailQuery.isError ? "Post-mortem introuvable." : "Chargement…"}</div>
        </div>
      </div>
    );
  }

  const depassementsValue = depassements ?? postMortem.postMortemDepassements ?? "";
  const ameliorationsValue = ameliorations ?? postMortem.postMortemAmeliorations ?? "";
  const recommandationValue = recommandation ?? postMortem.postMortemRecommandation ?? "";
  const hasAnalysis = !!(postMortem.postMortemDepassements || postMortem.postMortemAmeliorations || postMortem.postMortemRecommandation);
  const totalPlanned = postMortem.costBreakdown?.reduce((sum, row) => sum + row.planned, 0) ?? 0;
  const totalActual = postMortem.costBreakdown?.reduce((sum, row) => sum + row.actual, 0) ?? 0;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <div>
            <h2>Post-mortem — {postMortem.rollingNumber}</h2>
            <p className="modal-subtitle">{postMortem.company ?? postMortem.contactName} · comparaison planifié et réel</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
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
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>Comparatif planifié vs réel</h3>
              <p style={{ margin: "0 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
                Par catégorie — les valeurs réelles deviennent rouges uniquement lorsqu'elles dépassent le planifié.
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
                      <tr key={row.category}>
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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

          <div style={{ marginBottom: 4 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Analyse finale</h3>
            {!canManage && !hasAnalysis && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune analyse enregistrée.</p>}
            <div className="form-grid">
              <div className="field field-full">
                <label>Principaux dépassements</label>
                <textarea rows={3} value={depassementsValue} disabled={!canManage} onChange={(e) => setDepassements(e.target.value)} />
              </div>
              <div className="field field-full">
                <label>Améliorations GSC / leçons apprises</label>
                <textarea rows={3} value={ameliorationsValue} disabled={!canManage} onChange={(e) => setAmeliorations(e.target.value)} />
              </div>
              <div className="field field-full">
                <label>Recommandation pour un prochain budgétaire</label>
                <textarea rows={3} value={recommandationValue} disabled={!canManage} onChange={(e) => setRecommandation(e.target.value)} />
              </div>
            </div>
            {error && <p className="form-error">{error}</p>}
            {canManage && (
              <button
                type="button"
                className="btn btn-small"
                disabled={saveMutation.isPending}
                onClick={() =>
                  saveMutation.mutate({ depassements: depassementsValue, ameliorations: ameliorationsValue, recommandation: recommandationValue })
                }
                style={{ marginTop: 8 }}
              >
                {saveMutation.isPending ? "…" : "Enregistrer l'analyse"}
              </button>
            )}
          </div>
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
