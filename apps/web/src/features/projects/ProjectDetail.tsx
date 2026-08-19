import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchProjectDetail, formatCurrency, FINANCIAL_STATUS_LABELS } from "./api.js";
import { ProjectPurchaseEntries } from "./ProjectPurchaseEntries.js";
import { ProjectFulfillment } from "./ProjectFulfillment.js";
import { ProjectInvoicePlan } from "./ProjectInvoicePlan.js";
import { ProjectWarranty } from "./ProjectWarranty.js";
import { ProjectOptionsMenu } from "./ProjectOptionsMenu.js";
import { ProjectPlanningEditor } from "./ProjectPlanningEditor.js";

interface ProjectDetailProps {
  id: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

const FINANCIAL_BANNER_TEXT: Record<string, string> = {
  conforme: "La marge réelle respecte le seuil de conformité fixé par Direction.",
  at_risk: "La marge réelle s'approche du seuil critique — à surveiller.",
  critical: "La marge réelle est sous le seuil critique fixé par Direction.",
};

/**
 * Phase 2A (17 août 2026) : bandeau de statut financier, grille complète,
 * Progression du projet, Comparatif planifié vs réel, carte Budgétaire
 * archivé. Phase 2B : Achats réels (ProjectPurchaseEntries.tsx). Phase 2C :
 * Production et sortie (ProjectFulfillment.tsx), Cycle de facturation
 * (ProjectInvoicePlan.tsx). Phase 2D : Garantie (ProjectWarranty.tsx).
 * Phase 2F : menu Options (ProjectOptionsMenu.tsx). Post-mortem (2E) reste
 * en attente du contenu réel — voir CLAUDE.md, jamais deviné depuis la
 * référence v19.
 */
export function ProjectDetail({ id, onClose }: ProjectDetailProps) {
  const detailQuery = useQuery({ queryKey: ["project", id], queryFn: () => fetchProjectDetail(id) });
  const project = detailQuery.data?.project;
  const [optionsOpen, setOptionsOpen] = useState(false);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{project ? `${project.projectNumber} — ${project.name}` : "Projet"}</h2>
            {project && (
              <p className="modal-subtitle">
                {project.company ?? project.contactName} · {formatDate(project.createdAt)}
                {project.budgetDisplayId && <> · Budgétaire d'origine : {project.budgetDisplayId}</>}
              </p>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!project && <p>Chargement…</p>}
          {project && (
            <ProjectOptionsMenu project={project} open={optionsOpen} onClose={() => setOptionsOpen(false)} onDeleted={onClose} />
          )}
          {project && (
            <>
              <ProjectPlanningEditor project={project} />

              {project.financialStatus && (
                <div className={`financial-banner financial-banner-${project.financialStatus}`}>
                  <strong>{FINANCIAL_STATUS_LABELS[project.financialStatus]}</strong>
                  <p>
                    Marge réelle : {project.grossMarginPct} % ({formatCurrency(project.grossMargin ?? 0)}).{" "}
                    {FINANCIAL_BANNER_TEXT[project.financialStatus]}
                  </p>
                </div>
              )}

              <div className="stat-tile-grid">
                {project.sold !== undefined && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Prix vendu</span>
                    <span className="stat-tile-value">{formatCurrency(project.sold)}</span>
                  </div>
                )}
                <div className="stat-tile">
                  <span className="stat-tile-label">Heures planifiées</span>
                  <span className="stat-tile-value">{project.plannedHours} h</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Heures réelles</span>
                  <span className="stat-tile-value">{project.actualHours} h</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Utilisation heures</span>
                  <span className="stat-tile-value">{project.hoursUsedPct} %</span>
                </div>
                {project.plannedPurchases !== undefined && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Achats prévus</span>
                    <span className="stat-tile-value">{formatCurrency(project.plannedPurchases)}</span>
                  </div>
                )}
                {project.actualPurchases !== undefined && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Achats réels</span>
                    <span className="stat-tile-value">{formatCurrency(project.actualPurchases)}</span>
                  </div>
                )}
                <div className="stat-tile">
                  <span className="stat-tile-label">Installation planifiée</span>
                  <span className="stat-tile-value">
                    {project.installationPlannedHours} h
                    {project.installationPlannedCost !== undefined && <> · {formatCurrency(project.installationPlannedCost)}</>}
                  </span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Back-up heures</span>
                  <span className="stat-tile-value">
                    {project.backupHours} h{project.backupHoursCost !== undefined && <> · {formatCurrency(project.backupHoursCost)}</>}
                  </span>
                </div>
                {project.projectBackupAmount !== undefined && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Back-up projet</span>
                    <span className="stat-tile-value">{formatCurrency(project.projectBackupAmount)}</span>
                  </div>
                )}
                {project.grossMargin !== undefined && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Marge brute réelle</span>
                    <span className="stat-tile-value">{formatCurrency(project.grossMargin)}</span>
                  </div>
                )}
                {project.grossMarginPct !== undefined && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Marge brute %</span>
                    <span className="stat-tile-value">{project.grossMarginPct} %</span>
                  </div>
                )}
                {project.targetMarginPct !== undefined && project.targetMarginPct !== null && (
                  <div className="stat-tile">
                    <span className="stat-tile-label">Marge visée</span>
                    <span className="stat-tile-value">{project.targetMarginPct} %</span>
                  </div>
                )}
              </div>

              {project.progressionPct !== undefined && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15 }}>Progression du projet</h3>
                      <p style={{ margin: "4px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>
                        Calcul indépendant du Gantt, fondé sur les heures et les achats appliqués.
                      </p>
                    </div>
                    <span className="badge-pill badge-neutral">Automatique</span>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div className="progress-row">
                      <span style={{ color: "var(--gsc-color-muted)" }}>Progression affichée</span>
                      <strong>{project.progressionPct} %</strong>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, project.progressionPct))}%` }} />
                    </div>
                  </div>

                  <div className="stat-tile-grid" style={{ marginTop: 14, marginBottom: 0 }}>
                    <div className="stat-tile">
                      <span className="stat-tile-label">Calcul automatique</span>
                      <span className="stat-tile-value">{project.progressionPct} %</span>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-tile-label">Heures</span>
                      <span className="stat-tile-value">
                        {project.actualHours} / {project.plannedHours} h
                      </span>
                    </div>
                    {project.actualPurchases !== undefined && project.plannedPurchases !== undefined && (
                      <div className="stat-tile">
                        <span className="stat-tile-label">Achats</span>
                        <span className="stat-tile-value">
                          {formatCurrency(project.actualPurchases)} / {formatCurrency(project.plannedPurchases)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {project.comparatif.length > 0 && (
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
                          {project.comparatif[0]?.plannedCost !== undefined && (
                            <>
                              <th>Coût planifié</th>
                              <th>Coût réel</th>
                              <th>Écart $</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {project.comparatif.map((row) => (
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

              <ProjectPurchaseEntries projectId={project.id} />

              <ProjectFulfillment project={project} />

              <ProjectInvoicePlan projectId={project.id} />

              <ProjectWarranty project={project} />

              {project.budgetDisplayId && (
                <div className="card" style={{ background: "var(--gsc-color-blue-soft)", border: "none" }}>
                  <strong style={{ color: "var(--gsc-color-blue)" }}>Budgétaire de base {project.budgetDisplayId} archivé</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--gsc-color-ink)" }}>
                    Les catégories détaillées, achats, risques et majorations restent accessibles depuis le module Budgétaire.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          {project && (
            <button type="button" className="btn" onClick={() => setOptionsOpen((v) => !v)}>
              ⚙ Options
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
