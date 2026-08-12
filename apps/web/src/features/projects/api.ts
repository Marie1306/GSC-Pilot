import { apiFetch } from "../../lib/apiClient.js";

export interface ProjectListItem {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  contactName: string;
  company: string | null;
  sold: number;
}

export const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  ready_invoice: "Prêt à facturer",
  closed: "Terminé",
};

/**
 * Coup d'œil seulement (Phase 1, 12 août 2026) — la table de comparaison
 * planifié/réel par catégorie, le Gantt et le suivi des achats/heures réels
 * viennent dans une prochaine phase, leur détail exact restant à confirmer.
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
  sold: number;
  plannedHours: number;
  actualHours: number;
  hoursUsedPct: number;
  plannedPurchases: number;
  actualPurchases: number;
  backupHours: number;
  backupHoursCost: number;
  projectBackupAmount: number;
  grossMargin: number;
  grossMarginPct: number;
  targetMarginPct: number | null;
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
