import { apiFetch } from "../../lib/apiClient.js";

export interface DeliveryListItemDto {
  id: string;
  displayId: string;
  status: string;
  contactName: string;
  company: string | null;
  address: string | null;
  scheduledAt: string | null;
  driverEmployeeName: string | null;
  sourceLabel: string;
}

export function fetchDeliveries(): Promise<{ deliveries: DeliveryListItemDto[] }> {
  return apiFetch("/api/deliveries");
}

export interface DeliveryDetailDto {
  id: string;
  displayId: string;
  status: string;
  contactName: string;
  company: string | null;
  contactPhone: string | null;
  address: string | null;
  scheduledAt: string | null;
  items: string | null;
  driverEmployeeName: string | null;
  signatureCaptured: boolean;
  signatureImageUrl: string | null;
  conditionNote: string | null;
  kmTraveled: number | null;
  completedAt: string | null;
  sourceLabel: string;
  createdAt: string;
}

export function fetchDeliveryDetail(id: string): Promise<{ delivery: DeliveryDetailDto }> {
  return apiFetch(`/api/deliveries/${id}`);
}

export interface UpdateDeliveryInput {
  items?: string | null;
  kmTraveled?: number | null;
  conditionNote?: string | null;
}

export function updateDelivery(id: string, patch: UpdateDeliveryInput): Promise<void> {
  return apiFetch(`/api/deliveries/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function confirmDelivery(id: string, dataUrl: string): Promise<void> {
  return apiFetch(`/api/deliveries/${id}/confirm`, { method: "POST", body: JSON.stringify({ dataUrl }) });
}
