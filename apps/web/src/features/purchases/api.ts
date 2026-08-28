import { apiFetch } from "../../lib/apiClient.js";
import type { Persona } from "@gsc-pilot/business-rules";

// Types locaux plutôt que des schémas zod partagés — module démarré vite
// pour un besoin précis (liste rapide d'achats), étendu le 13 août 2026
// avec le formulaire général. À migrer vers packages/shared si/quand le
// reste du module achats se construit.

export interface ProjectOption {
  id: string;
  projectNumber: string;
  name: string;
}

export interface PurchaseCategoryOption {
  id: string;
  name: string;
  thresholdAmount: number;
}

export interface ShortlistLine {
  description: string;
  supplier?: string;
  estimatedAmountMin?: number;
  estimatedAmountMax?: number;
}

export type FulfillmentStatus = "waiting" | "ordered" | "received";
export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  waiting: "En attente",
  ordered: "Commandé",
  received: "Reçu",
};

export const STATUS_LABELS: Record<string, string> = {
  owner_pending: "En attente d'approbation",
  boss_pending: "En attente d'approbation",
  authorized: "Autorisée",
  rejected: "Rejetée",
};

export interface PurchaseRequestDto {
  id: string;
  displayId: string;
  requesterId: string;
  requesterName: string;
  requesterPersona: Persona;
  projectId: string | null;
  projectLabel: string | null;
  categoryName: string | null;
  supplier: string | null;
  description: string;
  amount?: number | null;
  estimatedAmountMin?: number | null;
  estimatedAmountMax?: number | null;
  thresholdAmountAtSubmission?: number | null;
  hasCategory: boolean;
  status: string;
  requestedAt: string;
  editedAt: string | null;
  fulfillmentStatus: FulfillmentStatus | null;
  appliedToProjectAt: string | null;
  expectedReceiptDate: string | null;
}

export interface NewPurchaseRequestInput {
  projectType: "project" | "internal";
  projectId?: string;
  categoryId: string;
  description: string;
  supplier?: string;
  estimatedAmountMin?: number;
  estimatedAmountMax?: number;
}

export interface UpdatePurchaseRequestInput {
  description?: string;
  supplier?: string | null;
  estimatedAmountMin?: number | null;
  estimatedAmountMax?: number | null;
}

const currencyFormatter = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function fetchProjects(): Promise<{ projects: ProjectOption[] }> {
  return apiFetch("/api/projects");
}

export function fetchPurchaseCategories(): Promise<{ categories: PurchaseCategoryOption[] }> {
  return apiFetch("/api/purchase-requests/categories");
}

export function fetchPurchaseRequests(): Promise<{ purchaseRequests: PurchaseRequestDto[] }> {
  return apiFetch("/api/purchase-requests");
}

export interface PurchaseRequestHistoryFilter {
  dateFrom?: string;
  dateTo?: string;
  projectId?: string;
}

/** Historique — 35 plus récentes par défaut, filtrable par date/projet pour voir plus loin (voir service.ts, API). */
export function fetchPurchaseRequestHistory(filter: PurchaseRequestHistoryFilter = {}): Promise<{ purchaseRequests: PurchaseRequestDto[] }> {
  const params = new URLSearchParams();
  if (filter.dateFrom) params.set("dateFrom", filter.dateFrom);
  if (filter.dateTo) params.set("dateTo", filter.dateTo);
  if (filter.projectId) params.set("projectId", filter.projectId);
  const query = params.toString();
  return apiFetch(`/api/purchase-requests/history${query ? `?${query}` : ""}`);
}

export function submitPurchaseRequest(input: NewPurchaseRequestInput): Promise<{ id: string; displayId: string }> {
  return apiFetch("/api/purchase-requests", { method: "POST", body: JSON.stringify(input) });
}

export function submitPurchaseShortlist(projectId: string, lines: ShortlistLine[]): Promise<{ purchaseRequests: string[] }> {
  return apiFetch("/api/purchase-requests/shortlist", { method: "POST", body: JSON.stringify({ projectId, lines }) });
}

export function updatePurchaseRequest(id: string, patch: UpdatePurchaseRequestInput): Promise<{ id: string }> {
  return apiFetch(`/api/purchase-requests/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function setPurchaseRequestAmount(id: string, amount: number): Promise<{ id: string; amount: number | null }> {
  return apiFetch(`/api/purchase-requests/${id}/amount`, { method: "PATCH", body: JSON.stringify({ amount }) });
}

export function setPurchaseRequestExpectedReceiptDate(id: string, expectedReceiptDate: string | null): Promise<{ id: string; expectedReceiptDate: string | null }> {
  return apiFetch(`/api/purchase-requests/${id}/expected-receipt-date`, { method: "PATCH", body: JSON.stringify({ expectedReceiptDate }) });
}

export function approvePurchaseRequest(id: string): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/purchase-requests/${id}/approve`, { method: "POST" });
}

export function rejectPurchaseRequest(id: string, reason?: string): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/purchase-requests/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function setFulfillmentStatus(id: string, status: FulfillmentStatus): Promise<{ id: string; fulfillmentStatus: string | null }> {
  return apiFetch(`/api/purchase-requests/${id}/fulfillment`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function applyPurchaseRequestToProject(id: string): Promise<{ id: string; appliedToProjectAt: string | null }> {
  return apiFetch(`/api/purchase-requests/${id}/apply-to-project`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// ProjectPurchaseEntry — mécanisme simple (Projet 2B, 17 août 2026). Distinct
// des PurchaseRequest ci-dessus — voir purchases/service.ts (API).
// ---------------------------------------------------------------------------

export interface ProjectPurchaseEntryDto {
  id: string;
  projectId: string;
  date: string;
  category: string;
  supplier: string | null;
  description: string;
  amount: number;
  enteredById: string;
  enteredByName: string;
  status: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface NewProjectPurchaseEntryInput {
  date: string;
  category: string;
  supplier?: string;
  description: string;
  amount: number;
  note?: string;
}

export function fetchProjectPurchaseEntries(projectId: string): Promise<{ entries: ProjectPurchaseEntryDto[] }> {
  return apiFetch(`/api/projects/${projectId}/purchase-entries`);
}

export function createProjectPurchaseEntry(
  projectId: string,
  input: NewProjectPurchaseEntryInput,
): Promise<{ entry: ProjectPurchaseEntryDto }> {
  return apiFetch(`/api/projects/${projectId}/purchase-entries`, { method: "POST", body: JSON.stringify(input) });
}

export function updateProjectPurchaseEntryAmount(id: string, amount: number): Promise<{ entry: ProjectPurchaseEntryDto }> {
  return apiFetch(`/api/purchase-entries/${id}/amount`, { method: "PATCH", body: JSON.stringify({ amount }) });
}

export function deleteProjectPurchaseEntry(id: string): Promise<void> {
  return apiFetch(`/api/purchase-entries/${id}`, { method: "DELETE" });
}

export function approveProjectPurchaseEntry(id: string): Promise<{ entry: ProjectPurchaseEntryDto }> {
  return apiFetch(`/api/purchase-entries/${id}/approve`, { method: "POST" });
}
