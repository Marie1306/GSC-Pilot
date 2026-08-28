import { apiFetch } from "../../lib/apiClient.js";

export {
  formatCurrency,
  requestInvoice,
  recordInvoice,
  recordInvoicePayment,
  type InvoicePlanEntryDto,
  type RecordInvoiceInput,
  type FinancialStatus,
  type ProjectComparatifRow,
} from "../projects/api.js";
import type { InvoicePlanEntryDto, FinancialStatus, ProjectComparatifRow } from "../projects/api.js";

export interface RollingListItemDto {
  id: string;
  contactName: string;
  company: string | null;
  status: string;
  sold?: number;
  fulfillmentMode: string | null;
  fulfillmentStatus: string | null;
  createdAt: string;
}

export function fetchRollings(): Promise<{ rollings: RollingListItemDto[] }> {
  return apiFetch("/api/rollings");
}

export interface RollingDetailDto {
  id: string;
  contactName: string;
  company: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: string;
  budgetId: string | null;
  budgetDisplayId: string | null;
  clientRequestId: string | null;
  createdAt: string;
  sold?: number;
  plannedHours: number;
  actualHours: number;
  hoursUsedPct: number;
  plannedPurchases?: number;
  actualPurchases?: number;
  grossMargin?: number;
  grossMarginPct?: number;
  targetMarginPct?: number | null;
  financialStatus?: FinancialStatus;
  progressionPct?: number;
  comparatif: ProjectComparatifRow[];
  productionCompleted: boolean;
  fulfillmentMode: string | null;
  fulfillmentStatus: string | null;
  fulfillmentAddress: string | null;
  fulfillmentDriverId: string | null;
  fulfillmentDriverName: string | null;
  fulfillmentScheduled: string | null;
  fulfillmentConfirmationNote: string | null;
  billingReady: boolean;
}

export function fetchRollingDetail(id: string): Promise<{ rolling: RollingDetailDto }> {
  return apiFetch(`/api/rollings/${id}`);
}

export interface NewRollingContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

export function createRollingDirect(newContact: NewRollingContactInput): Promise<{ rolling: { id: string } }> {
  return apiFetch("/api/rollings", { method: "POST", body: JSON.stringify(newContact) });
}

export function updateRollingSold(id: string, sold: number): Promise<void> {
  return apiFetch(`/api/rollings/${id}/sold`, { method: "PATCH", body: JSON.stringify({ sold }) });
}

export function fetchRollingInvoicePlan(id: string): Promise<{ plan: InvoicePlanEntryDto[] }> {
  return apiFetch(`/api/rollings/${id}/invoice-plan`);
}

export function markRollingProductionComplete(id: string): Promise<void> {
  return apiFetch(`/api/rollings/${id}/production-complete`, { method: "POST" });
}

export interface ChooseRollingFulfillmentInput {
  mode: "warehouse" | "manual" | "pickup";
  driverId?: string | null;
  address?: string;
  scheduled?: string | null;
}

export function chooseRollingFulfillmentMode(id: string, input: ChooseRollingFulfillmentInput): Promise<void> {
  return apiFetch(`/api/rollings/${id}/fulfillment-mode`, { method: "POST", body: JSON.stringify(input) });
}

export function confirmRollingFulfillment(id: string, note?: string): Promise<void> {
  return apiFetch(`/api/rollings/${id}/fulfillment-confirm`, { method: "POST", body: JSON.stringify({ note }) });
}

export interface RollingPostMortemDto {
  id: string;
  contactName: string;
  company: string | null;
  sold?: number;
  postMortemDepassements: string | null;
  postMortemAmeliorations: string | null;
  postMortemRecommandation: string | null;
}

export function fetchRollingPostMortem(id: string): Promise<{ postMortem: RollingPostMortemDto }> {
  return apiFetch(`/api/rollings/${id}/post-mortem`);
}

export interface UpdateRollingPostMortemInput {
  depassements?: string;
  ameliorations?: string;
  recommandation?: string;
}

export function updateRollingPostMortem(id: string, input: UpdateRollingPostMortemInput): Promise<void> {
  return apiFetch(`/api/rollings/${id}/post-mortem`, { method: "PATCH", body: JSON.stringify(input) });
}

/** Démarré depuis le Budgétaire (voir BudgetDetail.tsx) — route sur /api/budgets, pas /api/rollings (même patron que convertBudgetToProject). */
export function convertBudgetToRolling(budgetId: string): Promise<{ id: string }> {
  return apiFetch(`/api/budgets/${budgetId}/convert-to-rolling`, { method: "POST" });
}
