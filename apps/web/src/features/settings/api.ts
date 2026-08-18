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

export interface MarginThresholdsDto {
  conformeThreshold: number;
  atRiskThreshold: number;
}

export function fetchMarginThresholds(): Promise<{ thresholds: MarginThresholdsDto }> {
  return apiFetch("/api/settings/margin-thresholds");
}

export function updateMarginThresholds(update: MarginThresholdsDto): Promise<{ thresholds: MarginThresholdsDto }> {
  return apiFetch("/api/settings/margin-thresholds", { method: "PATCH", body: JSON.stringify(update) });
}

/**
 * Classes facturables en service (TechLevel), confirmé le 18 août 2026 —
 * trois taux distincts (régulier/temps supplémentaire/extra), la classe
 * réellement facturée se choisit au punch, pas fixée sur l'employé.
 */
export interface TechLevelDto {
  id: string;
  label: string;
  regularRate: number;
  overtimeRate: number;
  extraRate: number;
  active: boolean;
  sortOrder: number;
}

export function fetchTechLevels(): Promise<{ techLevels: TechLevelDto[] }> {
  return apiFetch("/api/settings/tech-levels");
}

export function createTechLevel(input: {
  label: string;
  regularRate: number;
  overtimeRate: number;
  extraRate: number;
}): Promise<{ techLevel: TechLevelDto }> {
  return apiFetch("/api/settings/tech-levels", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateTechLevelInput {
  label?: string;
  regularRate?: number;
  overtimeRate?: number;
  extraRate?: number;
  active?: boolean;
}

export function updateTechLevel(id: string, update: UpdateTechLevelInput): Promise<{ techLevel: TechLevelDto }> {
  return apiFetch(`/api/settings/tech-levels/${id}`, { method: "PATCH", body: JSON.stringify(update) });
}

export interface EmployeeDto {
  id: string;
  name: string;
  initials: string;
  active: boolean;
  techLevelIds: string[];
}

export function fetchEmployees(): Promise<{ employees: EmployeeDto[] }> {
  return apiFetch("/api/employees");
}

export function updateEmployeeTechLevels(employeeId: string, techLevelIds: string[]): Promise<{ employee: EmployeeDto }> {
  return apiFetch(`/api/employees/${employeeId}/tech-levels`, { method: "PATCH", body: JSON.stringify({ techLevelIds }) });
}
