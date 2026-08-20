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
 *
 * Les 3 champs de taux sont absents (pas juste à 0) pour Employé/Magasinier
 * — GET /tech-levels reste accessible à tout usager authentifié (chacun
 * doit voir le LIBELLÉ de ses propres classes pour choisir au punch), mais
 * les $/h restent retirés côté serveur pour qui ne voit jamais de valeurs
 * financières (canSeeFinancialValues, même principe que partout ailleurs).
 */
export interface TechLevelDto {
  id: string;
  label: string;
  regularRate?: number;
  overtimeRate?: number;
  extraRate?: number;
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

export type Persona = "owner" | "admin" | "boss" | "member" | "warehouse";

export const PERSONA_LABELS: Record<Persona, string> = {
  owner: "Direction",
  admin: "Administration",
  boss: "Propriétaire",
  member: "Employé",
  warehouse: "Magasinier",
};

export interface EmployeeDto {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  persona: Persona;
  jobTitle: string | null;
  skills: string[];
  skillEfficiencies: Record<string, number>;
  active: boolean;
  costRate?: number;
  techLevelIds: string[];
}

export function fetchEmployees(): Promise<{ employees: EmployeeDto[] }> {
  return apiFetch("/api/employees");
}

export function updateEmployeeTechLevels(employeeId: string, techLevelIds: string[]): Promise<{ employee: EmployeeDto }> {
  return apiFetch(`/api/employees/${employeeId}/tech-levels`, { method: "PATCH", body: JSON.stringify({ techLevelIds }) });
}

export interface CreateEmployeeInput {
  name: string;
  initials: string;
  email: string;
  persona: Persona;
  phone?: string;
  jobTitle?: string;
  costRate?: number;
}

/** Envoie aussi l'invitation Supabase (auth.admin.inviteUserByEmail) côté serveur — voir employees/service.ts. */
export function createEmployee(input: CreateEmployeeInput): Promise<{ employee: EmployeeDto }> {
  return apiFetch("/api/employees", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateEmployeeInput {
  name?: string;
  jobTitle?: string | null;
  phone?: string | null;
  skills?: string[];
  skillEfficiencies?: Record<string, number>;
  costRate?: number;
  persona?: Persona;
  active?: boolean;
}

export function updateEmployee(id: string, update: UpdateEmployeeInput): Promise<{ employee: EmployeeDto }> {
  return apiFetch(`/api/employees/${id}`, { method: "PATCH", body: JSON.stringify(update) });
}

export interface SalesChannelDto {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export function fetchSalesChannels(): Promise<{ salesChannels: SalesChannelDto[] }> {
  return apiFetch("/api/settings/sales-channels");
}
export function createSalesChannel(name: string): Promise<{ salesChannel: SalesChannelDto }> {
  return apiFetch("/api/settings/sales-channels", { method: "POST", body: JSON.stringify({ name }) });
}
export function updateSalesChannel(id: string, update: { name?: string; active?: boolean }): Promise<{ salesChannel: SalesChannelDto }> {
  return apiFetch(`/api/settings/sales-channels/${id}`, { method: "PATCH", body: JSON.stringify(update) });
}
export function moveSalesChannel(id: string, direction: "up" | "down"): Promise<{ salesChannels: SalesChannelDto[] }> {
  return apiFetch(`/api/settings/sales-channels/${id}/move`, { method: "POST", body: JSON.stringify({ direction }) });
}

export interface PunchableTaskDto {
  id: string;
  category: string;
  label: string;
  active: boolean;
  sortOrder: number;
  specificServiceRate: number | null;
}

export function fetchPunchableTasks(): Promise<{ tasks: PunchableTaskDto[] }> {
  return apiFetch("/api/settings/punchable-tasks");
}
export function createPunchableTask(category: string, label: string): Promise<{ task: PunchableTaskDto }> {
  return apiFetch("/api/settings/punchable-tasks", { method: "POST", body: JSON.stringify({ category, label }) });
}
export interface UpdatePunchableTaskInput {
  label?: string;
  active?: boolean;
  specificServiceRate?: number | null;
}
export function updatePunchableTask(id: string, update: UpdatePunchableTaskInput): Promise<{ task: PunchableTaskDto }> {
  return apiFetch(`/api/settings/punchable-tasks/${id}`, { method: "PATCH", body: JSON.stringify(update) });
}
export function movePunchableTask(id: string, direction: "up" | "down"): Promise<{ tasks: PunchableTaskDto[] }> {
  return apiFetch(`/api/settings/punchable-tasks/${id}/move`, { method: "POST", body: JSON.stringify({ direction }) });
}

export interface ServiceRatesDto {
  mileageRate: number;
  breakfastRate: number;
  lunchRate: number;
  dinnerRate: number;
  servicePartsDefaultMarginPct: number;
  urgencyFee: number;
}
export function fetchServiceRates(): Promise<{ rates: ServiceRatesDto }> {
  return apiFetch("/api/settings/service-rates");
}
export function updateServiceRates(update: Partial<ServiceRatesDto>): Promise<{ rates: ServiceRatesDto }> {
  return apiFetch("/api/settings/service-rates", { method: "PATCH", body: JSON.stringify(update) });
}

export interface BillingSplitStep {
  label: string;
  pct: number;
}
export function fetchBillingSplit(): Promise<{ steps: BillingSplitStep[] }> {
  return apiFetch("/api/settings/billing-split");
}
export function updateBillingSplit(steps: BillingSplitStep[]): Promise<{ steps: BillingSplitStep[] }> {
  return apiFetch("/api/settings/billing-split", { method: "PATCH", body: JSON.stringify({ steps }) });
}

export function fetchBudgetModelRate(): Promise<{ backupHourlyRate: number }> {
  return apiFetch("/api/settings/budget-model-rate");
}
export function updateBudgetModelRate(backupHourlyRate: number): Promise<{ backupHourlyRate: number }> {
  return apiFetch("/api/settings/budget-model-rate", { method: "PATCH", body: JSON.stringify({ backupHourlyRate }) });
}

export interface AuditLogEntryDto {
  id: string;
  at: string;
  actorName: string;
  actorPersona: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: unknown;
  justification: string | null;
}
export function fetchAuditLog(): Promise<{ entries: AuditLogEntryDto[] }> {
  return apiFetch("/api/settings/audit-log");
}
