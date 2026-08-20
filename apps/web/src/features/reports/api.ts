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

export interface InternalHoursEmployeeDto {
  employeeId: string;
  employeeName: string;
  hours: number;
  value: number;
  count: number;
}

export interface InternalPurchasesCategoryDto {
  category: string;
  amount: number;
  count: number;
}

export interface InternalStatsDto {
  year: number;
  availableYears: number[];
  hours: { employees: InternalHoursEmployeeDto[]; hours: number; value: number };
  purchases: { categories: InternalPurchasesCategoryDto[]; amount: number; count: number };
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
