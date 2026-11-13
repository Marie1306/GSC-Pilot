import { apiFetch } from "../../lib/apiClient.js";
import { formatCurrency } from "../budgets/api.js";

export { formatCurrency };

export type SoumissionStatus = "draft" | "sent" | "accepted" | "declined";

export const SOUMISSION_STATUS_LABELS: Record<SoumissionStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  accepted: "Acceptée",
  declined: "Refusée",
};

export interface SoumissionLineDto {
  id: string;
  label: string;
  amount: number;
  sortOrder: number;
}

export interface SoumissionDetailDto {
  id: string;
  displayId: string;
  budgetId: string;
  budgetDisplayId: string;
  contactName: string | null;
  company: string | null;
  status: SoumissionStatus;
  introText: string | null;
  termsText: string | null;
  amountBeforeTax: number | null;
  tpsAmount: number | null;
  tvqAmount: number | null;
  totalWithTax: number | null;
  sentAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  lines: SoumissionLineDto[];
}

export function fetchSoumissionsForBudget(budgetId: string): Promise<{ soumissions: SoumissionDetailDto[] }> {
  return apiFetch(`/api/budgets/${budgetId}/soumissions`);
}

export function fetchSoumissionDetail(id: string): Promise<{ soumission: SoumissionDetailDto }> {
  return apiFetch(`/api/soumissions/${id}`);
}

export interface SoumissionLineInput {
  label: string;
  amount: number;
}

export interface CreateSoumissionInput {
  introText?: string;
  termsText?: string;
  lines: SoumissionLineInput[];
}

export function createSoumission(budgetId: string, input: CreateSoumissionInput): Promise<{ soumission: SoumissionDetailDto }> {
  return apiFetch(`/api/budgets/${budgetId}/soumissions`, { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateSoumissionInput {
  introText?: string;
  termsText?: string;
  lines?: SoumissionLineInput[];
}

export function updateSoumission(id: string, input: UpdateSoumissionInput): Promise<{ soumission: SoumissionDetailDto }> {
  return apiFetch(`/api/soumissions/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function sendSoumission(id: string): Promise<{ soumission: SoumissionDetailDto }> {
  return apiFetch(`/api/soumissions/${id}/send`, { method: "POST" });
}

export function decideSoumission(id: string, outcome: "accepted" | "declined"): Promise<{ soumission: SoumissionDetailDto }> {
  return apiFetch(`/api/soumissions/${id}/decide`, { method: "POST", body: JSON.stringify({ outcome }) });
}

export function deleteSoumission(id: string): Promise<void> {
  return apiFetch(`/api/soumissions/${id}`, { method: "DELETE" });
}
