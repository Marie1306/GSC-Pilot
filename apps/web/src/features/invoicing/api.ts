import { apiFetch } from "../../lib/apiClient.js";

export {
  previewInvoiceRequest,
  confirmInvoiceRequest,
  cancelInvoiceRequest,
  recordInvoicePayment,
  correctInvoicePaidAmount,
  holdInvoiceEntry,
  releaseInvoiceHold,
  deleteInvoicePlanEntry,
  formatCurrency,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_BADGE,
  type InvoiceEntryStatus,
  type InvoiceRequestPreviewDto,
} from "../projects/api.js";

export interface InvoiceAmendmentLineDto {
  id: string;
  displayId: string;
  description: string | null;
  amount: number;
}

export interface InvoiceEntryDto {
  id: string;
  label: string;
  pct: number;
  amount: number;
  status: "pending" | "sent" | "paid" | "on_hold" | "overdue";
  invoiceNumber: string | null;
  dueDate: string | null;
  tpsAmount: number | null;
  tvqAmount: number | null;
  totalWithTax: number | null;
  note: string | null;
  paidAmount: number;
  paidAt: string | null;
  isExtra: boolean;
  requestedAt: string | null;
  processedAt: string | null;
  sourceType: "project" | "rolling" | "serviceCall" | "externalSale";
  sourceLabel: string;
  clientLabel: string;
  sourceDeleted: boolean;
  // Carte client détaillée pour l'export PDF (16 novembre 2026) — à côté de
  // clientLabel ci-dessus (déjà affiché tel quel dans InvoicingPage.tsx).
  contactName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  amendmentLines: InvoiceAmendmentLineDto[];
  baseAmount: number;
}

/** Vue consolidée — jalons déjà demandés seulement (voir invoicing/service.ts, backend). */
export function fetchInvoiceEntries(): Promise<{ entries: InvoiceEntryDto[] }> {
  return apiFetch("/api/invoicing/entries");
}
