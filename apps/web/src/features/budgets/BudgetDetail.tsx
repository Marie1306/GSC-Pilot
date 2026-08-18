import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  canModifyBudget,
  canModifyBudgetPurchaseLine,
  canApproveBudgetForSending,
  canRecordBudgetOutcome,
  canConvertBudgetToProject,
} from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { convertBudgetToProject, fetchNextProjectNumber } from "../projects/api.js";
import { BudgetOptionsMenu } from "./BudgetOptionsMenu.js";
import {
  fetchBudgetDetail,
  updateRow,
  addBudgetRow,
  removeBudgetRow,
  updateSectionComplexity,
  updateBackupSettings,
  updateProjectBackup,
  updateBudgetMeta,
  markBudgetReady,
  markBudgetSent,
  markBudgetWon,
  markBudgetDeclined,
  formatCurrency,
  computeDetailedSummary,
  STATUS_LABELS,
  CATEGORY_LABELS,
  BUDGET_GROUP_LABELS,
  CATEGORY_GROUP,
  MODULAR_CATEGORIES,
  REQUEST_TYPE_LABELS,
  type BudgetSectionData,
  type BudgetSectionRow,
  type BudgetGroupKey,
  type RequestType,
  type UpdateRowPatch,
  type UpdateBudgetMetaInput,
} from "./api.js";

interface BudgetDetailProps {
  id: string;
  onClose: () => void;
}

const COMPLEXITY_OPTIONS = Array.from({ length: 11 }, (_, i) => i);
type StatusAction = "ready" | "sent" | "won" | "declined";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Une ligne "labor" ou marquée directionOnly exige Direction seulement; sinon Direction ET Propriétaire — voir service.ts, même règle côté serveur. */
function isRowEditable(row: BudgetSectionRow, kind: "labor" | "purchase", canModifyLabor: boolean, canModifyPurchase: boolean): boolean {
  const requiresDirectionOnly = kind === "labor" || row.directionOnly;
  return requiresDirectionOnly ? canModifyLabor : canModifyPurchase;
}

interface BudgetSectionCardProps {
  section: BudgetSectionData;
  canModifyLabor: boolean;
  canModifyPurchase: boolean;
  busy: boolean;
  /** Ligne en cours d'enregistrement (une seule à la fois, voir onUpdateRow) — verrouille seulement CETTE ligne, jamais tout le tableau (12 août 2026 : bloquer tout le tableau à chaque frappe empêchait une saisie continue sur plusieurs lignes). */
  savingRowId: string | undefined;
  onUpdateRow: (rowId: string, patch: UpdateRowPatch) => void;
  onAddRow: (sectionId: string, label: string, unitPrice: number) => void;
  onRemoveRow: (rowId: string) => void;
  onUpdateComplexity: (sectionId: string, complexity: number) => void;
}

function BudgetSectionCard({
  section,
  canModifyLabor,
  canModifyPurchase,
  busy,
  savingRowId,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
  onUpdateComplexity,
}: BudgetSectionCardProps) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const isModular = MODULAR_CATEGORIES.includes(section.category);
  const labelEditable = isModular; // seules les sections à lignes vierges permettent de nommer/renommer une ligne

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!newLabel.trim()) return;
    onAddRow(section.id, newLabel.trim(), Number(newPrice || 0));
    setAdding(false);
    setNewLabel("");
    setNewPrice("");
  }

  return (
    <section className="card budget-section">
      <div className="budget-section-header">
        <h3>{CATEGORY_LABELS[section.category] ?? section.category}</h3>
        <div className="field budget-complexity-field">
          <label htmlFor={`complexity-${section.id}`}>Complexité</label>
          <select
            id={`complexity-${section.id}`}
            value={section.complexity}
            disabled={!canModifyLabor || busy}
            onChange={(e) => onUpdateComplexity(section.id, Number(e.target.value))}
          >
            {COMPLEXITY_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
      </div>

      <table className="shortlist-table budget-rows-table">
        <thead>
          <tr>
            <th>{section.kind === "labor" ? "Tâche" : "Article / Dépense"}</th>
            {section.kind === "labor" && <th className="num">Taux</th>}
            <th className="num">{section.kind === "labor" ? "Heures" : "Qté"}</th>
            {section.kind === "purchase" && <th className="num">Prix unit.</th>}
            <th>Risque / note</th>
            {isModular && <th></th>}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => {
            const editable = isRowEditable(row, section.kind, canModifyLabor, canModifyPurchase) && !busy && savingRowId !== row.id;
            return (
              <tr key={row.id}>
                <td>
                  {labelEditable ? (
                    <input
                      key={`label-${row.id}-${row.label}`}
                      placeholder="Nom de l'article / dépense"
                      defaultValue={row.label}
                      disabled={!editable}
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        if (label !== row.label) onUpdateRow(row.id, { label });
                      }}
                    />
                  ) : (
                    <>
                      {row.label}
                      {row.auto && <div className="cell-sub">Calcul automatique, non punchable</div>}
                    </>
                  )}
                </td>
                {section.kind === "labor" && <td className="num">{formatCurrency(row.hourlyRate)}</td>}
                <td className="num">
                  {row.auto ? (
                    <span className="budget-readonly-value">{row.hours}</span>
                  ) : (
                    <input
                      key={`qty-${row.id}-${section.kind === "labor" ? row.hours : row.qty}`}
                      type="number"
                      min={0}
                      step={section.kind === "labor" ? 0.25 : 1}
                      defaultValue={section.kind === "labor" ? row.hours : row.qty}
                      disabled={!editable}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => {
                        const value = Number(e.target.value || 0);
                        if (section.kind === "labor") {
                          if (value !== row.hours) onUpdateRow(row.id, { hours: value });
                        } else if (value !== row.qty) {
                          onUpdateRow(row.id, { qty: value });
                        }
                      }}
                    />
                  )}
                </td>
                {section.kind === "purchase" && (
                  <td className="num">
                    <input
                      key={`price-${row.id}-${row.unitPrice}`}
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={row.unitPrice}
                      disabled={!editable}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => {
                        const unitPrice = Number(e.target.value || 0);
                        if (unitPrice !== row.unitPrice) onUpdateRow(row.id, { unitPrice });
                      }}
                    />
                  </td>
                )}
                <td>
                  <input
                    key={`risk-${row.id}-${row.risk}`}
                    placeholder="Risque, hypothèse ou note"
                    defaultValue={row.risk ?? ""}
                    disabled={!editable}
                    onBlur={(e) => {
                      const risk = e.target.value.trim() || null;
                      if (risk !== row.risk) onUpdateRow(row.id, { risk });
                    }}
                  />
                </td>
                {isModular && (
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Retirer la ligne"
                      disabled={busy || !editable || section.rows.length === 1}
                      onClick={() => onRemoveRow(row.id)}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {isModular && canModifyPurchase && (
        <div className="budget-add-row">
          {adding ? (
            <form className="budget-add-row-form" onSubmit={handleAdd}>
              <input placeholder="Nom de la ligne" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} autoFocus />
              <input type="number" min={0} placeholder="Prix unit. (facultatif)" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
              <button type="submit" className="btn btn-secondary" disabled={!newLabel.trim() || busy}>
                Ajouter
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setAdding(false);
                  setNewLabel("");
                  setNewPrice("");
                }}
              >
                Annuler
              </button>
            </form>
          ) : (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setAdding(true)}>
              + Ajouter une ligne
            </button>
          )}
        </div>
      )}

      <div className="budget-section-total">
        <span>
          Heures <strong>{section.hours}</strong>
        </span>
        <span>
          Coût planifié <strong>{formatCurrency(section.baseCost)}</strong>
        </span>
        <span>Marge {section.margin} %</span>
        <span>
          Prix de vente <strong>{formatCurrency(section.sale)}</strong>
        </span>
      </div>
    </section>
  );
}

function buildSectionList(sections: BudgetSectionData[]): { key: string; group: BudgetGroupKey | null; section: BudgetSectionData }[] {
  let lastGroup: BudgetGroupKey | null = null;
  return sections.map((section) => {
    const group = CATEGORY_GROUP[section.category] ?? null;
    const entryGroup = group !== lastGroup ? group : null;
    lastGroup = group;
    return { key: section.id, group: entryGroup, section };
  });
}

export function BudgetDetail({ id, onClose }: BudgetDetailProps) {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["budget", id], queryFn: () => fetchBudgetDetail(id) });
  const [error, setError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  // Numéro suggéré (plus grand + 1) préaffiché mais modifiable — pour
  // reprendre un numéro hérité de l'ancien système (confirmé 17 août 2026).
  // Pas de useEffect pour copier la suggestion serveur : nul tant que
  // Direction n'a rien tapé, comme projectName mais avec une valeur par
  // défaut dérivée à l'affichage (même patron que MarginThresholdsCard).
  const [projectNumberOverride, setProjectNumberOverride] = useState<string | null>(null);
  const nextProjectNumberQuery = useQuery({
    queryKey: ["next-project-number"],
    queryFn: fetchNextProjectNumber,
    enabled: showConvertForm,
  });
  const projectNumber = projectNumberOverride ?? String(nextProjectNumberQuery.data?.nextProjectNumber ?? "");

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["budget", id] });
    void queryClient.invalidateQueries({ queryKey: ["budgets"] });
  };
  // Sans ceci, un échec (permission refusée, ligne calculée automatiquement,
  // validation) échouait entièrement en silence — aucun message, aucun
  // indicateur — sur les 8 actions de cet écran (voir audit du 12 août 2026).
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const rowMutation = useMutation({
    mutationFn: ({ rowId, patch }: { rowId: string; patch: UpdateRowPatch }) => updateRow(id, rowId, patch),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const addRowMutation = useMutation({
    mutationFn: ({ sectionId, label, unitPrice }: { sectionId: string; label: string; unitPrice: number }) =>
      addBudgetRow(id, sectionId, { label, unitPrice }),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const removeRowMutation = useMutation({
    mutationFn: (rowId: string) => removeBudgetRow(id, rowId),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const complexityMutation = useMutation({
    mutationFn: ({ sectionId, complexity }: { sectionId: string; complexity: number }) => updateSectionComplexity(id, sectionId, complexity),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const backupMutation = useMutation({
    mutationFn: (patch: { pct?: number; complexity?: number }) => updateBackupSettings(id, patch),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const projectBackupMutation = useMutation({
    mutationFn: (patch: { amount?: number; complexity?: number }) => updateProjectBackup(id, patch),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const metaMutation = useMutation({
    mutationFn: (patch: UpdateBudgetMetaInput) => updateBudgetMeta(id, patch),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const statusMutation = useMutation({
    mutationFn: (action: StatusAction) => {
      if (action === "ready") return markBudgetReady(id);
      if (action === "sent") return markBudgetSent(id);
      if (action === "won") return markBudgetWon(id);
      return markBudgetDeclined(id);
    },
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const convertMutation = useMutation({
    mutationFn: () => convertBudgetToProject(id, projectName.trim(), projectNumber.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/projets");
    },
    onError: onMutationError,
  });

  if (!employee) return null;

  const budget = detailQuery.data?.budget;
  const canModifyLabor = canModifyBudget(employee.persona);
  const canModifyPurchase = canModifyBudgetPurchaseLine(employee.persona);
  const canApprove = canApproveBudgetForSending(employee.persona);
  const canOutcome = canRecordBudgetOutcome(employee.persona);
  const canConvert = canConvertBudgetToProject(employee.persona);
  const busy =
    rowMutation.isPending ||
    addRowMutation.isPending ||
    removeRowMutation.isPending ||
    complexityMutation.isPending ||
    backupMutation.isPending ||
    projectBackupMutation.isPending ||
    metaMutation.isPending ||
    statusMutation.isPending ||
    convertMutation.isPending;
  // Busy du tableau de lignes SEULEMENT — exclut volontairement rowMutation
  // (voir savingRowId ci-dessous) et les mutations d'autres cartes
  // (méta/back-up), sans rapport avec la saisie de lignes. Corrige le 13
  // août 2026 : le `busy` global désactivait TOUTES les lignes dès qu'UNE
  // seule sauvegardait (~0,5 s), empêchant une saisie continue sur
  // plusieurs lignes — signalé par l'utilisatrice.
  const rowsBusy = addRowMutation.isPending || removeRowMutation.isPending || complexityMutation.isPending || statusMutation.isPending || convertMutation.isPending;
  const savingRowId = rowMutation.isPending ? rowMutation.variables?.rowId : undefined;
  const missingSummary = Boolean(budget) && (!budget!.summary?.trim() || !budget!.riskSummary?.trim());
  const detailedSummary = budget ? computeDetailedSummary(budget) : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal budget-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{budget ? `${budget.displayId} — ${budget.company ?? budget.contactName}` : "Budgétaire"}</h2>
            {budget && (
              <p className="modal-subtitle">
                Créé par {budget.createdByName} · {formatDate(budget.createdAt)}
                {budget.clientRequestDisplayId && <> · Demande d'origine : {budget.clientRequestDisplayId}</>}
              </p>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!budget && <p>Chargement…</p>}
          {error && <p className="form-error">{error}</p>}
          {budget && (
            <>
              <div className="budget-total-bar">
                <div>
                  <span className="detail-label">Statut</span>
                  <span>{STATUS_LABELS[budget.status] ?? budget.status}</span>
                </div>
                <div>
                  <span className="detail-label">Heures totales</span>
                  <span>{budget.totals.totalHours}</span>
                </div>
                <div className="budget-total-highlight">
                  <span className="detail-label">Grand total — Prix de vente</span>
                  <span>{formatCurrency(budget.totals.totalSale)}</span>
                </div>
              </div>

              <div className="detail-grid">
                <div>
                  <span className="detail-label">Coût planifié</span>
                  <span>{formatCurrency(detailedSummary!.coutPlanifie)}</span>
                </div>
                <div>
                  <span className="detail-label">Achats détaillés</span>
                  <span>{formatCurrency(detailedSummary!.achatsDetailles)}</span>
                </div>
                <div>
                  <span className="detail-label">Réserve de back-up projet</span>
                  <span>{formatCurrency(budget.projectBackupAmount)}</span>
                </div>
                <div>
                  <span className="detail-label">Réserve d'heures de back-up</span>
                  <span>
                    {budget.backup.hours} h · {formatCurrency(budget.backup.baseCost)}
                  </span>
                </div>
                <div>
                  <span className="detail-label">Marge résultante</span>
                  <span>{detailedSummary!.margeResultante} %</span>
                </div>
              </div>

              <h3 className="budget-group-heading">Aperçu par catégorie</h3>
              <div className="detail-grid">
                <div>
                  <span className="detail-label">Conception & Dessin</span>
                  <span>
                    {detailedSummary!.conception.hours} h · {formatCurrency(detailedSummary!.conception.cost)}
                  </span>
                </div>
                <div>
                  <span className="detail-label">Fabrication & Assemblage</span>
                  <span>
                    {detailedSummary!.fabricationAssemblage.hours} h · {formatCurrency(detailedSummary!.fabricationAssemblage.cost)}
                  </span>
                </div>
                <div>
                  <span className="detail-label">Panneau & Programmation</span>
                  <span>
                    {detailedSummary!.panelProgramming.hours} h · {formatCurrency(detailedSummary!.panelProgramming.cost)}
                  </span>
                </div>
                <div>
                  <span className="detail-label">Sous-traitance</span>
                  <span>{formatCurrency(detailedSummary!.subcontracting.cost)}</span>
                </div>
                <div>
                  <span className="detail-label">Installation — Heures</span>
                  <span>
                    {detailedSummary!.installationLabor.hours} h · {formatCurrency(detailedSummary!.installationLabor.cost)}
                  </span>
                </div>
                <div>
                  <span className="detail-label">Installation — Stock et frais divers</span>
                  <span>{formatCurrency(detailedSummary!.installationStockExpenses.cost)}</span>
                </div>
              </div>

              <section className="card budget-section">
                <div className="budget-section-header">
                  <h3>Informations du client et de la demande</h3>
                </div>
                <p className="modal-subtitle">Le contact est lié au carnet de contacts et à la demande client — jamais ressaisi ici.</p>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">Type prévu</span>
                    <span>{(budget.requestType && REQUEST_TYPE_LABELS[budget.requestType as RequestType]) ?? budget.requestType ?? "—"}</span>
                  </div>
                  <div>
                    <span className="detail-label">Client</span>
                    <span>{budget.company ?? "—"}</span>
                  </div>
                  <div>
                    <span className="detail-label">Contact</span>
                    <span>{budget.contactName}</span>
                  </div>
                  <div>
                    <span className="detail-label">Courriel</span>
                    <span>{budget.email ?? "—"}</span>
                  </div>
                  <div>
                    <span className="detail-label">Téléphone</span>
                    <span>{budget.phone ?? "—"}</span>
                  </div>
                  <div>
                    <span className="detail-label">Date de demande</span>
                    <span>{budget.requestCreatedAt ? formatDate(budget.requestCreatedAt) : "—"}</span>
                  </div>
                </div>
                {budget.requestSummary && (
                  <div className="field field-full">
                    <span className="detail-label">Portée / informations générales (demande d'origine)</span>
                    <p>{budget.requestSummary}</p>
                  </div>
                )}
              </section>

              <section className="card budget-section">
                <div className="budget-section-header">
                  <h3>Informations du budgétaire</h3>
                </div>
                <div className="form-grid budget-meta-grid">
                  <div className="field">
                    <label htmlFor="meta-po">PO client (facultatif)</label>
                    <input
                      id="meta-po"
                      key={`po-${budget.poNumber}`}
                      defaultValue={budget.poNumber ?? ""}
                      disabled={!canModifyLabor || busy}
                      onBlur={(e) => {
                        const value = e.target.value.trim() || null;
                        if (value !== budget.poNumber) metaMutation.mutate({ poNumber: value });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="meta-quantity">Quantité</label>
                    <input
                      id="meta-quantity"
                      key={`qty-${budget.quantity}`}
                      type="number"
                      min={1}
                      defaultValue={budget.quantity}
                      disabled={!canModifyLabor || busy}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => {
                        const value = Math.max(1, Number(e.target.value || 1));
                        if (value !== budget.quantity) metaMutation.mutate({ quantity: value });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="meta-validUntil">Valide jusqu'au (facultatif)</label>
                    <input
                      id="meta-validUntil"
                      key={`valid-${budget.validUntil}`}
                      type="date"
                      defaultValue={toDateInputValue(budget.validUntil)}
                      disabled={!canModifyLabor || busy}
                      onBlur={(e) => {
                        const value = e.target.value.trim() || null;
                        if (value !== toDateInputValue(budget.validUntil)) metaMutation.mutate({ validUntil: value });
                      }}
                    />
                  </div>
                  <div className="field field-full">
                    <label htmlFor="meta-summary">Résumé du budgétaire {missingSummary && <span className="required-hint">— obligatoire avant de marquer prêt</span>}</label>
                    <textarea
                      id="meta-summary"
                      key={`summary-${budget.summary}`}
                      rows={2}
                      placeholder="Portée, hypothèses, prix, échéancier…"
                      defaultValue={budget.summary ?? ""}
                      disabled={!canModifyLabor || busy}
                      onBlur={(e) => {
                        const value = e.target.value.trim() || null;
                        if (value !== budget.summary) metaMutation.mutate({ summary: value });
                      }}
                    />
                  </div>
                  <div className="field field-full">
                    <label htmlFor="meta-riskSummary">
                      Résumé des risques {missingSummary && <span className="required-hint">— obligatoire avant de marquer prêt</span>}
                    </label>
                    <textarea
                      id="meta-riskSummary"
                      key={`risk-summary-${budget.riskSummary}`}
                      rows={2}
                      placeholder="Complexité, ressources critiques, disponibilité des composantes…"
                      defaultValue={budget.riskSummary ?? ""}
                      disabled={!canModifyLabor || busy}
                      onBlur={(e) => {
                        const value = e.target.value.trim() || null;
                        if (value !== budget.riskSummary) metaMutation.mutate({ riskSummary: value });
                      }}
                    />
                  </div>
                </div>
              </section>

              {buildSectionList(budget.sections).map((entry): ReactNode => (
                <div key={entry.key}>
                  {entry.group && <h2 className="budget-group-heading">{BUDGET_GROUP_LABELS[entry.group]}</h2>}
                  <BudgetSectionCard
                    section={entry.section}
                    canModifyLabor={canModifyLabor}
                    canModifyPurchase={canModifyPurchase}
                    busy={rowsBusy}
                    savingRowId={savingRowId}
                    onUpdateRow={(rowId, patch) => rowMutation.mutate({ rowId, patch })}
                    onAddRow={(sectionId, label, unitPrice) => addRowMutation.mutate({ sectionId, label, unitPrice })}
                    onRemoveRow={(rowId) => removeRowMutation.mutate(rowId)}
                    onUpdateComplexity={(sectionId, complexity) => complexityMutation.mutate({ sectionId, complexity })}
                  />
                </div>
              ))}

              <section className="card budget-section">
                <div className="budget-section-header">
                  <div>
                    <h3>Back-up d'heures</h3>
                    <small>Réserve calculée automatiquement sur Fabrication + Panneau & Programmation + Assemblage & Test — non punchable.</small>
                  </div>
                </div>
                <div className="form-grid budget-backup-grid">
                  <div className="field">
                    <label htmlFor="backup-pct">% des heures admissibles</label>
                    <input
                      id="backup-pct"
                      key={`pct-${budget.backupHoursPct}`}
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={budget.backupHoursPct}
                      disabled={!canModifyLabor || busy}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => {
                        const pct = Number(e.target.value || 0);
                        if (pct !== budget.backupHoursPct) backupMutation.mutate({ pct });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="backup-complexity">Complexité</label>
                    <select
                      id="backup-complexity"
                      value={budget.backupHoursComplexity}
                      disabled={!canModifyLabor || busy}
                      onChange={(e) => backupMutation.mutate({ complexity: Number(e.target.value) })}
                    >
                      {COMPLEXITY_OPTIONS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="budget-section-total">
                  <span>
                    Heures <strong>{budget.backup.hours}</strong>
                  </span>
                  <span>
                    Coût planifié <strong>{formatCurrency(budget.backup.baseCost)}</strong>
                  </span>
                  <span>Marge {budget.backup.margin} %</span>
                  <span>
                    Prix de vente <strong>{formatCurrency(budget.backup.sale)}</strong>
                  </span>
                </div>
              </section>

              <section className="card budget-section">
                <div className="budget-section-header">
                  <div>
                    <h3>Back-up projet</h3>
                    <small>Réserve distincte du back-up d'heures ci-dessus — montant saisi à la main, la complexité détermine la marge.</small>
                  </div>
                </div>
                <div className="form-grid budget-backup-grid">
                  <div className="field">
                    <label htmlFor="project-backup-amount">Montant de réserve</label>
                    <input
                      id="project-backup-amount"
                      key={`pb-amount-${budget.projectBackupAmount}`}
                      type="number"
                      min={0}
                      step={100}
                      defaultValue={budget.projectBackupAmount}
                      disabled={!canModifyLabor || busy}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => {
                        const amount = Number(e.target.value || 0);
                        if (amount !== budget.projectBackupAmount) projectBackupMutation.mutate({ amount });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="project-backup-complexity">Complexité</label>
                    <select
                      id="project-backup-complexity"
                      value={budget.projectBackupComplexity}
                      disabled={!canModifyLabor || busy}
                      onChange={(e) => projectBackupMutation.mutate({ complexity: Number(e.target.value) })}
                    >
                      {COMPLEXITY_OPTIONS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="budget-section-total">
                  <span>
                    Coût planifié <strong>{formatCurrency(budget.projectBackup.baseCost)}</strong>
                  </span>
                  <span>Marge {budget.projectBackup.margin} %</span>
                  <span>
                    Prix de vente <strong>{formatCurrency(budget.projectBackup.sale)}</strong>
                  </span>
                </div>
              </section>

              <div className="status-row">
                <span className="detail-label">Suivi</span>
                <div className="status-actions">
                  {budget.status === "draft" && canApprove && (
                    <>
                      <button type="button" className="btn" disabled={busy || missingSummary} onClick={() => statusMutation.mutate("ready")}>
                        Marquer le budgétaire prêt
                      </button>
                      {missingSummary && <span className="required-hint">Complétez le résumé et le résumé des risques pour continuer.</span>}
                    </>
                  )}
                  {budget.status === "ready" && canOutcome && (
                    <button type="button" className="btn" disabled={busy} onClick={() => statusMutation.mutate("sent")}>
                      Marquer la soumission envoyée
                    </button>
                  )}
                  {budget.status === "sent" && canOutcome && (
                    <>
                      <button type="button" className="btn" disabled={busy} onClick={() => statusMutation.mutate("won")}>
                        Contrat obtenu
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => statusMutation.mutate("declined")}>
                        Refusé
                      </button>
                    </>
                  )}
                  {(budget.status === "won" || budget.status === "declined") && (
                    <span className={`status-btn ${budget.status === "won" ? "status-btn-active" : ""}`}>{STATUS_LABELS[budget.status]}</span>
                  )}
                </div>
              </div>

              {budget.status === "won" && canConvert && (
                <div className="status-row">
                  <span className="detail-label">Projet</span>
                  {!showConvertForm ? (
                    <div>
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => setShowConvertForm(true)}>
                        Convertir en projet
                      </button>
                    </div>
                  ) : (
                    <form
                      className="budget-add-row-form"
                      onSubmit={(event: FormEvent) => {
                        event.preventDefault();
                        if (!projectName.trim() || !projectNumber.trim()) return;
                        convertMutation.mutate();
                      }}
                    >
                      <input placeholder="Nom du projet" value={projectName} onChange={(e) => setProjectName(e.target.value)} autoFocus />
                      <input
                        placeholder="Numéro"
                        style={{ width: 100 }}
                        value={projectNumber}
                        onChange={(e) => setProjectNumberOverride(e.target.value)}
                        title="Préaffiché automatiquement (plus grand numéro + 1) — modifiable pour reprendre un numéro hérité de l'ancien système."
                      />
                      <button type="submit" className="btn btn-small" disabled={!projectName.trim() || !projectNumber.trim() || busy}>
                        {convertMutation.isPending ? "Conversion…" : "Confirmer"}
                      </button>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowConvertForm(false)}>
                        Annuler
                      </button>
                    </form>
                  )}
                  {convertMutation.isError && (
                    <p className="form-error" style={{ marginTop: 8 }}>
                      {convertMutation.error instanceof ApiError ? convertMutation.error.message : "Une erreur est survenue — réessayez."}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          {budget && (
            <button type="button" className="btn" onClick={() => setOptionsOpen((v) => !v)}>
              ⚙ Options
            </button>
          )}
        </div>
      </div>

      {budget && <BudgetOptionsMenu budget={budget} open={optionsOpen} onClose={() => setOptionsOpen(false)} onDeleted={onClose} />}
    </div>
  );
}
