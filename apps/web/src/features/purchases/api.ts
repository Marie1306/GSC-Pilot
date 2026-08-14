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
