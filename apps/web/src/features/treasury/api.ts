import { apiFetch } from "../../lib/apiClient.js";
import { formatCurrency } from "../projects/api.js";

export { formatCurrency };

export interface TreasurySettingsDto {
  checkingOpeningBalance: number;
  checkingOpeningDate: string;
  locOpeningBalance: number;
  locOpeningDate: string;
  sweepThreshold: number;
}

export function fetchTreasurySettings(): Promise<{ settings: TreasurySettingsDto | null }> {
  return apiFetch("/api/treasury/settings");
}

export function saveTreasurySettings(input: TreasurySettingsDto): Promise<{ settings: TreasurySettingsDto }> {
  return apiFetch("/api/treasury/settings", { method: "PUT", body: JSON.stringify(input) });
}

export interface RecurringExpenseOverrideDto {
  yearMonth: string;
  amount: number;
}
export interface RecurringExpenseDto {
  id: string;
  label: string;
  dayOfMonth: number;
  defaultAmount: number;
  active: boolean;
  overrides: RecurringExpenseOverrideDto[];
}

export function fetchRecurringExpenses(): Promise<{ expenses: RecurringExpenseDto[] }> {
  return apiFetch("/api/treasury/recurring-expenses");
}

export interface CreateRecurringExpenseInput {
  label: string;
  dayOfMonth: number;
  defaultAmount: number;
}
export function createRecurringExpense(input: CreateRecurringExpenseInput): Promise<{ expense: RecurringExpenseDto }> {
  return apiFetch("/api/treasury/recurring-expenses", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateRecurringExpenseInput {
  label?: string;
  dayOfMonth?: number;
  defaultAmount?: number;
  active?: boolean;
}
export function updateRecurringExpense(id: string, input: UpdateRecurringExpenseInput): Promise<{ expense: RecurringExpenseDto }> {
  return apiFetch(`/api/treasury/recurring-expenses/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteRecurringExpense(id: string): Promise<void> {
  return apiFetch(`/api/treasury/recurring-expenses/${id}`, { method: "DELETE" });
}

export function setRecurringExpenseOverride(id: string, yearMonth: string, amount: number): Promise<{ expense: RecurringExpenseDto }> {
  return apiFetch(`/api/treasury/recurring-expenses/${id}/overrides/${yearMonth}`, { method: "PUT", body: JSON.stringify({ amount }) });
}

export function clearRecurringExpenseOverride(id: string, yearMonth: string): Promise<{ expense: RecurringExpenseDto }> {
  return apiFetch(`/api/treasury/recurring-expenses/${id}/overrides/${yearMonth}`, { method: "DELETE" });
}

export interface ManualEntryDto {
  id: string;
  label: string;
  amount: number;
  date: string;
}

export function fetchManualEntries(): Promise<{ entries: ManualEntryDto[] }> {
  return apiFetch("/api/treasury/manual-entries");
}

export interface CreateManualEntryInput {
  label: string;
  amount: number;
  date: string;
}
export function createManualEntry(input: CreateManualEntryInput): Promise<{ entry: ManualEntryDto }> {
  return apiFetch("/api/treasury/manual-entries", { method: "POST", body: JSON.stringify(input) });
}

export function deleteManualEntry(id: string): Promise<void> {
  return apiFetch(`/api/treasury/manual-entries/${id}`, { method: "DELETE" });
}

export type LocSweepDirection = "draw" | "repay";
export interface LocSweepStepDto {
  direction: LocSweepDirection;
  amount: number;
}
export interface ConfirmedInvoiceEventDto {
  date: string;
  amount: number;
  invoiceNumber: string;
  sourceLabel: string;
  clientLabel: string;
}
export interface ForecastWeekRowDto {
  weekStart: string;
  weekEnd: string;
  invoiceTotal: number;
  invoiceDetails: ConfirmedInvoiceEventDto[];
  recurringTotal: number;
  manualTotal: number;
  checkingBalanceBeforeSweep: number;
  sweeps: LocSweepStepDto[];
  checkingBalance: number;
  locOwed: number;
}

export function fetchForecastTable(weeks = 13): Promise<{ weeks: ForecastWeekRowDto[] }> {
  return apiFetch(`/api/treasury/forecast?weeks=${weeks}`);
}

export interface PendingForecastEntryDto {
  id: string;
  sourceLabel: string;
  clientLabel: string;
  amount: number;
  effectiveDate: string | null;
  isManualDate: boolean;
}

export function fetchPendingForecastEntries(): Promise<{ entries: PendingForecastEntryDto[] }> {
  return apiFetch("/api/treasury/pending-entries");
}

/** Même route que le geste "Demander la facturation" (projects/api.ts, invoice-plan/:entryId/forecast-date) — réutilisée ici depuis la Trésorerie. */
export function setForecastDate(entryId: string, forecastDate: string | null): Promise<void> {
  return apiFetch(`/api/invoice-plan/${entryId}/forecast-date`, { method: "PATCH", body: JSON.stringify({ forecastDate }) });
}
