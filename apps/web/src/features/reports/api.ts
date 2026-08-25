import { apiFetch } from "../../lib/apiClient.js";
import type { FinancialStatus } from "../projects/api.js";

export { formatCurrency, FINANCIAL_STATUS_LABELS } from "../projects/api.js";
export type { FinancialStatus } from "../projects/api.js";

export interface ProfitabilityRowDto {
  id: string;
  type: "project" | "rolling" | "service_call";
  typeLabel: string;
  displayId: string;
  label: string;
  clientLabel: string;
  revenue: number;
  cost: number | null;
  grossMargin: number | null;
  grossMarginPct: number | null;
  financialStatus: FinancialStatus | null;
  actualHours: number | null;
}

export interface ChannelConversionDto {
  salesChannelId: string;
  name: string;
  total: number;
  converted: number;
  conversionPct: number;
}

export interface InternalHoursTaskDto {
  taskId: string;
  taskLabel: string;
  hours: number;
  value: number;
  count: number;
}

export interface InternalHoursDetailDto {
  id: string;
  date: string;
  employeeName: string;
  taskLabel: string;
  hours: number;
  value: number;
}

export interface InternalPurchasesCategoryDto {
  category: string;
  amount: number;
  count: number;
}

export interface InternalPurchaseDetailDto {
  id: string;
  requestedAt: string;
  supplier: string | null;
  categoryName: string;
  amount: number;
}

export interface InternalStatsDto {
  year: number;
  availableYears: number[];
  hours: { tasks: InternalHoursTaskDto[]; hours: number; value: number; detail: InternalHoursDetailDto[] };
  purchases: { categories: InternalPurchasesCategoryDto[]; amount: number; count: number; detail: InternalPurchaseDetailDto[] };
}

export interface ReportsOverviewDto {
  profitability: ProfitabilityRowDto[];
  channelConversion: ChannelConversionDto[];
  internalStats: InternalStatsDto;
}

export function fetchReportsOverview(year?: number): Promise<ReportsOverviewDto> {
  const query = year ? `?year=${year}` : "";
  return apiFetch(`/api/reports/overview${query}`);
}
