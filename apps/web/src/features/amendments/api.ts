import { apiFetch } from "../../lib/apiClient.js";

export interface AmendmentDto {
  id: string;
  displayId: string;
  projectId: string;
  createdByName: string;
  createdAt: string;
  hoursByCategory: Record<string, number>;
  marginPct: number;
  backupPct: number;
  laborHours: number;
  backupEligibleHours: number;
  backupHours: number;
  purchases?: number;
  laborCost?: number;
  backupCost?: number;
  totalCost?: number;
  sale?: number;
}

export interface CreateAmendmentInput {
  hoursByCategory: Record<string, number>;
  marginPct: number;
  backupPct: number;
  purchases?: number;
}

export function fetchProjectAmendments(projectId: string): Promise<{ amendments: AmendmentDto[] }> {
  return apiFetch(`/api/projects/${projectId}/amendments`);
}

export function createAmendment(projectId: string, input: CreateAmendmentInput): Promise<{ amendment: AmendmentDto }> {
  return apiFetch(`/api/projects/${projectId}/amendments`, { method: "POST", body: JSON.stringify(input) });
}
