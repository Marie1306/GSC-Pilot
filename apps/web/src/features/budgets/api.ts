import { apiFetch } from "../../lib/apiClient.js";
import { BUDGET_CATEGORY_LABELS, BUDGET_GROUP_LABELS, BUDGET_CATEGORY_GROUP, MODULAR_BUDGET_CATEGORIES } from "@gsc-pilot/business-rules";
import { REQUEST_TYPE_LABELS, type RequestType } from "../clientRequests/api.js";

export interface ClientRequestOption {
  id: string;
  displayId: string;
  contactName: string;
  company: string | null;
  summary: string;
  requestType: string;
  status: string;
  budgetId: string | null;
}

export interface SalesChannelOption {
  id: string;
  name: string;
}

// Mêmes valeurs/libellés que features/clientRequests/api.ts — dupliqués
// plutôt que partagés entre fonctionnalités (même choix que le reste de ce
// fichier, voir CATEGORY_LABELS ci-dessous).
export type Urgency = "urgent" | "normal" | "discuss";
export const URGENCY_LABELS: Record<Urgency, string> = {
  urgent: "Urgent",
  normal: "Non urgent",
  discuss: "À discuter",
};

export interface NewClientRequestForBudget {
  company: string;
  contactName: string;
  contactRole?: string;
  phone: string;
  email: string;
  address?: string;
  requestType: "project" | "rolling" | "service";
  urgency: "urgent" | "normal" | "discuss";
  salesChannelId: string;
  sourceDetail?: string;
  summary: string;
}

export interface CreateBudgetInput {
  clientRequestId?: string;
  newClientRequest?: NewClientRequestForBudget;
}

export interface BudgetListItem {
  id: string;
  displayId: string;
  status: string;
  contactName: string;
  company: string | null;
  createdByName: string;
  createdAt: string;
  totalSale: number;
}

export type BudgetSectionKind = "labor" | "purchase";

export interface BudgetSectionRow {
  id: string;
  label: string;
  hourlyRate: number;
  hours: number; // heures effectives (déjà calculées côté serveur si auto === true)
  qty: number;
  unitPrice: number;
  directionOnly: boolean;
  auto: boolean; // heures calculées automatiquement à partir d'une autre ligne — non modifiable directement
  risk: string | null;
}

export interface BudgetSectionData {
  id: string;
  category: string;
  kind: BudgetSectionKind;
  hours: number;
  baseCost: number;
  sale: number;
  complexity: number;
  margin: number;
  rows: BudgetSectionRow[];
}

export interface BudgetBackupData {
  hours: number;
  baseCost: number;
  sale: number;
  pct: number;
  complexity: number;
  margin: number;
  rate: number;
}

export interface ProjectBackupData {
  baseCost: number;
  sale: number;
  complexity: number;
  margin: number;
}

export interface BudgetDetail extends BudgetListItem {
  backupHourlyRate: number;
  backupHoursPct: number;
  backupHoursComplexity: number;
  projectBackupAmount: number;
  projectBackupComplexity: number;
  poNumber: string | null;
  quantity: number;
  validUntil: string | null;
  summary: string | null;
  riskSummary: string | null;
  clientRequestId: string | null;
  clientRequestDisplayId: string | null;
  // Toujours lus depuis la demande client liée, jamais ressaisis sur le
  // budgétaire (confirmé le 13 août 2026 — voir service.ts, apps/api).
  requestType: string | null;
  email: string | null;
  phone: string | null;
  requestCreatedAt: string | null;
  requestSummary: string | null;
  sentAt: string | null;
  contractWonAt: string | null;
  readOnly: boolean;
  sections: BudgetSectionData[];
  backup: BudgetBackupData;
  projectBackup: ProjectBackupData;
  totals: { totalHours: number; totalBaseCost: number; totalSale: number };
  notes: BudgetNoteDto[];
}

export interface BudgetNoteDto {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/**
 * Sommaire « Budgétaire détaillé » (vue v19, confirmée verbalement par
 * l'utilisatrice le 12 août 2026 — pas les montants de sa capture d'écran,
 * cette partie de la v19 n'a jamais été ajustée/fiabilisée). Entièrement
 * dérivé de `sections`/`totals` déjà renvoyés par l'API — aucun nouveau
 * champ serveur nécessaire.
 *
 * Regroupement PROPRE à cette vue, différent des 13 catégories du
 * calculateur ET des 5 groupes de la future comparaison Projet :
 * Fabrication+Assemblage combinées, Installation Stock+Frais divers
 * combinées, 5 catégories d'achats (hors Sous-traitance et Installation)
 * repliées dans « Achats détaillés » seulement, jamais affichées seules ici.
 * Sous-traitance a sa propre carte plus bas — exclue explicitement
 * d'« Achats détaillés » pour ne pas la compter deux fois (confirmé le 13
 * août 2026, corrige une ambiguïté laissée ouverte à la construction).
 */
export interface CategoryRollup {
  hours: number;
  cost: number;
}

export interface DetailedSummary {
  /** Main-d'œuvre + achats de toutes les catégories, AVANT marge — exclut les deux back-up (contrairement à totals.totalBaseCost). */
  coutPlanifie: number;
  /** Achats de toutes les catégories sauf Sous-traitance (déjà sa propre carte) et celles du groupe Installation, avant marge. */
  achatsDetailles: number;
  /** Marge globale du budgétaire — (prix vendu total − coût total, catégories + back-up) ÷ prix vendu total. */
  margeResultante: number;
  conception: CategoryRollup;
  fabricationAssemblage: CategoryRollup;
  panelProgramming: CategoryRollup;
  subcontracting: CategoryRollup;
  installationLabor: CategoryRollup;
  installationStockExpenses: CategoryRollup;
}

function rollupCategories(sections: BudgetSectionData[], categories: string[]): CategoryRollup {
  return sections
    .filter((section) => categories.includes(section.category))
    .reduce((acc, section) => ({ hours: acc.hours + section.hours, cost: acc.cost + section.baseCost }), { hours: 0, cost: 0 });
}

export function computeDetailedSummary(budget: BudgetDetail): DetailedSummary {
  const coutPlanifie = budget.sections.reduce((acc, section) => acc + section.baseCost, 0);
  const achatsDetailles = budget.sections
    .filter((section) => section.kind === "purchase" && section.category !== "subcontracting" && CATEGORY_GROUP[section.category] !== "installation")
    .reduce((acc, section) => acc + section.baseCost, 0);
  const { totalSale, totalBaseCost } = budget.totals;
  const margeResultante = totalSale > 0 ? Math.round(((totalSale - totalBaseCost) / totalSale) * 1000) / 10 : 0;

  return {
    coutPlanifie,
    achatsDetailles,
    margeResultante,
    conception: rollupCategories(budget.sections, ["conception"]),
    fabricationAssemblage: rollupCategories(budget.sections, ["fabrication", "assemblyTest"]),
    panelProgramming: rollupCategories(budget.sections, ["panelProgramming"]),
    subcontracting: rollupCategories(budget.sections, ["subcontracting"]),
    installationLabor: rollupCategories(budget.sections, ["installationLabor"]),
    installationStockExpenses: rollupCategories(budget.sections, ["installationStock", "installationExpenses"]),
  };
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  ready: "Prêt",
  sent: "Envoyé",
  won: "Contrat obtenu",
  declined: "Refusé",
};

// Dérivés du catalogue unique (@gsc-pilot/business-rules/categories.ts,
// partagé avec l'API et le seed) plutôt que retapés ici — voir l'audit du
// 12 août 2026, section H. CATEGORY_LABELS/CATEGORY_GROUP/MODULAR_CATEGORIES
// gardent leurs noms d'origine pour ne pas devoir changer chaque écran qui
// les consomme déjà.
export const CATEGORY_LABELS: Record<string, string> = BUDGET_CATEGORY_LABELS;
export { BUDGET_GROUP_LABELS, REQUEST_TYPE_LABELS };
export type { RequestType };
export type BudgetGroupKey = keyof typeof BUDGET_GROUP_LABELS;
export const CATEGORY_GROUP: Record<string, BudgetGroupKey> = BUDGET_CATEGORY_GROUP;
export const MODULAR_CATEGORIES: readonly string[] = MODULAR_BUDGET_CATEGORIES;

const currencyFormatter = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function fetchClientRequests(): Promise<{ clientRequests: ClientRequestOption[] }> {
  return apiFetch("/api/client-requests");
}

export function fetchSalesChannels(): Promise<{ salesChannels: SalesChannelOption[] }> {
  return apiFetch("/api/sales-channels");
}

export function fetchNextBudgetNumber(): Promise<{ nextDisplayId: string }> {
  return apiFetch("/api/budgets/next-number");
}

export function fetchBudgets(): Promise<{ budgets: BudgetListItem[] }> {
  return apiFetch("/api/budgets");
}

export function fetchBudgetDetail(id: string): Promise<{ budget: BudgetDetail }> {
  return apiFetch(`/api/budgets/${id}`);
}

export function createBudget(input: CreateBudgetInput): Promise<{ id: string; displayId: string }> {
  return apiFetch("/api/budgets", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateRowPatch {
  label?: string;
  hours?: number;
  qty?: number;
  unitPrice?: number;
  risk?: string | null;
}

export function updateRow(budgetId: string, rowId: string, patch: UpdateRowPatch): Promise<void> {
  return apiFetch(`/api/budgets/${budgetId}/rows/${rowId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function addBudgetRow(budgetId: string, sectionId: string, input: { label: string; unitPrice?: number }): Promise<{ id: string }> {
  return apiFetch(`/api/budgets/${budgetId}/sections/${sectionId}/rows`, { method: "POST", body: JSON.stringify(input) });
}

export function removeBudgetRow(budgetId: string, rowId: string): Promise<void> {
  return apiFetch(`/api/budgets/${budgetId}/rows/${rowId}`, { method: "DELETE" });
}

export function updateSectionComplexity(budgetId: string, sectionId: string, complexity: number): Promise<void> {
  return apiFetch(`/api/budgets/${budgetId}/sections/${sectionId}`, { method: "PATCH", body: JSON.stringify({ complexity }) });
}

export function updateBackupSettings(budgetId: string, patch: { pct?: number; complexity?: number }): Promise<void> {
  return apiFetch(`/api/budgets/${budgetId}/backup`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function updateProjectBackup(budgetId: string, patch: { amount?: number; complexity?: number }): Promise<void> {
  return apiFetch(`/api/budgets/${budgetId}/project-backup`, { method: "PATCH", body: JSON.stringify(patch) });
}

export interface UpdateBudgetMetaInput {
  poNumber?: string | null;
  quantity?: number;
  validUntil?: string | null;
  summary?: string | null;
  riskSummary?: string | null;
}

export function updateBudgetMeta(budgetId: string, patch: UpdateBudgetMetaInput): Promise<void> {
  return apiFetch(`/api/budgets/${budgetId}/meta`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function markBudgetReady(id: string): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/budgets/${id}/mark-ready`, { method: "POST" });
}

export function markBudgetSent(id: string): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/budgets/${id}/mark-sent`, { method: "POST" });
}

export function markBudgetWon(id: string): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/budgets/${id}/mark-won`, { method: "POST" });
}

export function markBudgetDeclined(id: string): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/budgets/${id}/mark-declined`, { method: "POST" });
}

export function deleteBudget(id: string): Promise<void> {
  return apiFetch(`/api/budgets/${id}`, { method: "DELETE" });
}

export function resetBudgetContent(id: string): Promise<void> {
  return apiFetch(`/api/budgets/${id}/reset`, { method: "POST" });
}

export function addBudgetNote(id: string, body: string): Promise<{ note: BudgetNoteDto }> {
  return apiFetch(`/api/budgets/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) });
}
