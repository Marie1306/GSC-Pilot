import { apiFetch } from "../../lib/apiClient.js";

export type FinancialStatus = "conforme" | "at_risk" | "critical";

export interface ProjectListItem {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  contactName: string;
  company: string | null;
  deadline: string | null;
  sold?: number;
  hoursUsedPct: number;
  progressionPct?: number;
  grossMarginPct?: number;
  financialStatus?: FinancialStatus;
}

export const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  ready_invoice: "Prêt à facturer",
  closed: "Terminé",
};

export const FINANCIAL_STATUS_LABELS: Record<FinancialStatus, string> = {
  conforme: "Conforme",
  at_risk: "À risque",
  critical: "Critique",
};

export interface ProjectComparatifRow {
  category: string;
  categoryLabel: string;
  plannedHours: number;
  actualHours: number;
  hoursDelta: number;
  plannedCost?: number;
  actualCost?: number;
  costDelta?: number;
}

/**
 * Vue enrichie de la Phase 2A (17 août 2026). Les champs $ sont absents
 * (pas juste à 0) pour Employé/Magasinier — voir canSeeFinancialValues côté
 * serveur — donc tous optionnels ici plutôt que number avec une valeur par
 * défaut trompeuse.
 */
export interface ProjectDetail {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  contactName: string;
  company: string | null;
  budgetId: string | null;
  budgetDisplayId: string | null;
  createdAt: string;
  sold?: number;
  plannedHours: number;
  actualHours: number;
  hoursUsedPct: number;
  plannedPurchases?: number;
  actualPurchases?: number;
  installationPlannedHours: number;
  installationPlannedCost?: number;
  backupHours: number;
  backupHoursCost?: number;
  projectBackupAmount?: number;
  grossMargin?: number;
  grossMarginPct?: number;
  targetMarginPct?: number | null;
  financialStatus?: FinancialStatus;
  progressionPct?: number;
  comparatif: ProjectComparatifRow[];
}

const currencyFormatter = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function fetchProjects(): Promise<{ projects: ProjectListItem[] }> {
  return apiFetch("/api/projects/full");
}

export function fetchProjectDetail(id: string): Promise<{ project: ProjectDetail }> {
  return apiFetch(`/api/projects/${id}`);
}

export function convertBudgetToProject(budgetId: string, name: string): Promise<{ id: string; projectNumber: string }> {
  return apiFetch(`/api/budgets/${budgetId}/convert-to-project`, { method: "POST", body: JSON.stringify({ name }) });
}
