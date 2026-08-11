import { apiFetch } from "../../lib/apiClient.js";

export interface PurchaseCategoryDto {
  id: string;
  name: string;
  thresholdAmount: number;
  active: boolean;
  sortOrder: number;
}

export function fetchPurchaseCategories(): Promise<{ categories: PurchaseCategoryDto[] }> {
  return apiFetch("/api/settings/purchase-categories");
}

export function createPurchaseCategory(name: string, thresholdAmount: number): Promise<{ category: PurchaseCategoryDto }> {
  return apiFetch("/api/settings/purchase-categories", { method: "POST", body: JSON.stringify({ name, thresholdAmount }) });
}

export function updatePurchaseCategory(
  id: string,
  update: { name?: string; thresholdAmount?: number; active?: boolean },
): Promise<{ category: PurchaseCategoryDto }> {
  return apiFetch(`/api/settings/purchase-categories/${id}`, { method: "PATCH", body: JSON.stringify(update) });
}
