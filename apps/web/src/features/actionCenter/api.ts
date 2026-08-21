import { apiFetch } from "../../lib/apiClient.js";

export type ActionItemType = "budget_approval" | "purchase_approval" | "invoicing" | "client_request_transmitted";

export interface ActionItemDto {
  id: string;
  type: ActionItemType;
  typeLabel: string;
  label: string;
  sublabel: string;
  amount?: number;
  createdAt: string;
}

export function fetchActionCenterItems(): Promise<{ items: ActionItemDto[] }> {
  return apiFetch("/api/action-center/items");
}
