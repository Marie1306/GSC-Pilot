import { apiFetch } from "../../lib/apiClient.js";

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

export interface NewClientRequestForBudget {
  company: string;
  contactName: string;
  contactRole?: string;
  phone: string;
  email: string;
  address?: string;
  requestType: "project" | "rolling" | "service";
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

export interface BudgetSectionRow {
  id: string;
  label: string;
  hourlyRate: number;
  hours: number;
}

export interface BudgetSectionData {
  id: string;
  category: string;
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

export interface BudgetDetail extends BudgetListItem {
  backupHourlyRate: number;
  backupHoursPct: number;
  backupHoursComplexity: number;
  clientRequestId: string | null;
  sentAt: string | null;
  contractWonAt: string | null;
  sections: BudgetSectionData[];
  backup: BudgetBackupData;
  totals: { totalHours: number; totalBaseCost: number; totalSale: number };
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  ready: "Prêt",
  sent: "Envoyé",
  won: "Contrat obtenu",
  declined: "Refusé",
};

export const CATEGORY_LABELS: Record<string, string> = {
  conception: "Conception",
  fabrication: "Fabrication",
  programmation: "Programmation",
  assemblage: "Assemblage",
  installation: "Installation",
};

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

export function updateRowHours(budgetId: string, rowId: string, hours: number): Promise<void> {
  return apiFetch(`/api/budgets/${budgetId}/rows/${rowId}`, { method: "PATCH", body: JSON.stringify({ hours }) });
}

export function updateSectionComplexity(budgetId: string, sectionId: string, complexity: number): Promise<void> {
  return apiFetch(`/api/budgets/${budgetId}/sections/${sectionId}`, { method: "PATCH", body: JSON.stringify({ complexity }) });
}

export function updateBackupSettings(budgetId: string, patch: { pct?: number; complexity?: number }): Promise<void> {
  return apiFetch(`/api/budgets/${budgetId}/backup`, { method: "PATCH", body: JSON.stringify(patch) });
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
