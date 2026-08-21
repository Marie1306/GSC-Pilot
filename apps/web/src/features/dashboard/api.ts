import { apiFetch } from "../../lib/apiClient.js";

export interface DashboardSummaryDto {
  activeProjectsCount?: number;
  activeRollingsCount?: number;
  budgetsInProgressCount?: number;
  invoicingToProcessCount?: number;
  myWeekHours: number;
  myPendingEntriesCount: number;
  myAssignedDeliveriesCount?: number;
}

export function fetchDashboardSummary(): Promise<{ summary: DashboardSummaryDto }> {
  return apiFetch("/api/dashboard/summary");
}
