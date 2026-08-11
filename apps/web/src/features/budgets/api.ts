import { apiFetch } from "../../lib/apiClient.js";
import { BUDGET_CATEGORY_LABELS, BUDGET_GROUP_LABELS, BUDGET_CATEGORY_GROUP, MODULAR_BUDGET_CATEGORIES } from "@gsc-pilot/business-rules";

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
  sentAt: string | null;
  contractWonAt: string | null;
  sections: BudgetSectionData[];
  backup: BudgetBackupData;
  projectBackup: ProjectBackupData;
  totals: { totalHours: number; totalBaseCost: number; totalSale: number };
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
export { BUDGET_GROUP_LABELS };
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
