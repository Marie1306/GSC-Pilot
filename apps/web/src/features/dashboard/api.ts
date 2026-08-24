import { apiFetch } from "../../lib/apiClient.js";

export interface ProjectHealthDto {
  projectNumber: string;
  name: string;
  progressionPct: number;
  grossMarginPct?: number;
  financialStatus?: "conforme" | "at_risk" | "critical";
  deadline: string | null;
}

export interface RecentInvoiceDto {
  id: string;
  invoiceNumber: string;
  clientLabel: string;
  sourceLabel: string;
  processedAt: string | null;
  dueDate: string | null;
  amount: number;
  paidAmount: number;
  status: string;
}

export interface ChannelConversionDto {
  salesChannelId: string;
  name: string;
  total: number;
  converted: number;
  conversionPct: number;
}

export interface DashboardSummaryDto {
  activeProjectsCount?: number;
  activeRollingsCount?: number;
  budgetsInProgressCount?: number;
  invoicingToProcessCount?: number;
  receivableBalance?: number;
  recentInvoices?: RecentInvoiceDto[];
  portfolioMarginPct?: number;
  projectHealth?: ProjectHealthDto[];
  channelConversion?: ChannelConversionDto[];
  actionCenterCount: number;
  actionCenterBreakdown: string;
  myWeekHours: number;
  myPendingEntriesCount: number;
  myAssignedDeliveriesCount?: number;
}

export function fetchDashboardSummary(): Promise<{ summary: DashboardSummaryDto }> {
  return apiFetch("/api/dashboard/summary");
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(value);
}
