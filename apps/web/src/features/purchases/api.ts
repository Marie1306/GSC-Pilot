import { apiFetch } from "../../lib/apiClient.js";

// Types locaux plutôt que des schémas zod partagés — module démarré vite
// pour un besoin précis (liste rapide d'achats). À migrer vers
// packages/shared si/quand le reste du module achats se construit.

export interface ProjectOption {
  id: string;
  projectNumber: string;
  name: string;
}

export interface ShortlistLine {
  description: string;
  supplier?: string;
  estimatedAmountMin?: number;
  estimatedAmountMax?: number;
}

export interface PurchaseRequestDto {
  id: string;
  displayId: string;
  requesterId: string;
  requesterName: string;
  projectId: string | null;
  projectLabel: string | null;
  supplier: string | null;
  description: string;
  amount?: number | null;
  estimatedAmountMin?: number | null;
  estimatedAmountMax?: number | null;
  hasCategory: boolean;
  status: string;
  requestedAt: string;
}

export function fetchProjects(): Promise<{ projects: ProjectOption[] }> {
  return apiFetch("/api/projects");
}

export function fetchPurchaseRequests(): Promise<{ purchaseRequests: PurchaseRequestDto[] }> {
  return apiFetch("/api/purchase-requests");
}

export function submitPurchaseShortlist(projectId: string, lines: ShortlistLine[]): Promise<{ purchaseRequests: string[] }> {
  return apiFetch("/api/purchase-requests/shortlist", { method: "POST", body: JSON.stringify({ projectId, lines }) });
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
