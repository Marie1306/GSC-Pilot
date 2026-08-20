import { apiFetch } from "../../lib/apiClient.js";

export {
  requestInvoice,
  recordInvoice,
  recordInvoicePayment,
  formatCurrency,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_BADGE,
  type InvoiceEntryStatus,
  type RecordInvoiceInput,
} from "../projects/api.js";

export interface InvoiceEntryDto {
  id: string;
  label: string;
  pct: number;
  amount: number;
  status: "pending" | "sent" | "paid" | "on_hold" | "overdue";
  invoiceNumber: string | null;
  dueDate: string | null;
  paidAmount: number;
  paidAt: string | null;
  isExtra: boolean;
  requestedAt: string | null;
  processedAt: string | null;
  sourceType: "project" | "rolling" | "serviceCall";
  sourceLabel: string;
  clientLabel: string;
}

/** Vue consolidée — jalons déjà demandés seulement (voir invoicing/service.ts, backend). */
export function fetchInvoiceEntries(): Promise<{ entries: InvoiceEntryDto[] }> {
  return apiFetch("/api/invoicing/entries");
}
