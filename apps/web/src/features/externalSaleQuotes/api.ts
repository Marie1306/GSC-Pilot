import { apiFetch } from "../../lib/apiClient.js";
import { formatCurrency } from "../budgets/api.js";

export { formatCurrency };

// Affiché « Soumission » à l'écran partout (décision confirmée — même mot
// que Projet/Roulement) — seuls les noms de fichiers/routes/variables
// internes utilisent ExternalSaleQuote/externalSaleQuotes, voir
// schema.prisma pour le détail du piège de nommage volontaire.
export type ExternalSaleQuoteStatus = "draft" | "sent" | "accepted" | "declined";

export const EXTERNAL_SALE_QUOTE_STATUS_LABELS: Record<ExternalSaleQuoteStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  accepted: "Acceptée",
  declined: "Refusée",
};

export interface NextExternalSaleQuoteNumberDto {
  nextDisplayId: string;
  defaultMarginPct: number;
}

export function fetchNextExternalSaleQuoteNumber(): Promise<NextExternalSaleQuoteNumberDto> {
  return apiFetch("/api/external-sale-quotes/next-number");
}

export interface ExternalSaleQuoteListItemDto {
  id: string;
  displayId: string;
  contactName: string;
  company: string | null;
  status: ExternalSaleQuoteStatus;
  salePrice: number | null;
  createdAt: string;
  convertedSaleId: string | null;
}

export function fetchExternalSaleQuotes(): Promise<{ quotes: ExternalSaleQuoteListItemDto[] }> {
  return apiFetch("/api/external-sale-quotes");
}

export interface ExternalSaleQuoteLineDto {
  id: string;
  description: string;
  qty: number;
  unitCost: number;
  amount: number;
}

export interface ExternalSaleQuoteDetailDto {
  id: string;
  displayId: string;
  clientRequestId: string | null;
  contactName: string;
  company: string | null;
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  status: ExternalSaleQuoteStatus;
  transportFee: number;
  adminFee: number;
  marginPct: number;
  partsBaseCost: number | null;
  salePrice: number | null;
  tpsAmount: number | null;
  tvqAmount: number | null;
  totalWithTax: number | null;
  introText: string | null;
  termsText: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  convertedSaleId: string | null;
  convertedSaleDisplayId: string | null;
  lines: ExternalSaleQuoteLineDto[];
}

/** Route renvoie le DTO directement (pas de wrapper), même patron que fetchExternalSaleDetail. */
export function fetchExternalSaleQuoteDetail(id: string): Promise<ExternalSaleQuoteDetailDto> {
  return apiFetch(`/api/external-sale-quotes/${id}`);
}

export interface ExternalSaleQuoteLineInput {
  description: string;
  qty: number;
  unitCost: number;
}

export interface NewExternalSaleQuoteContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

export interface CreateExternalSaleQuoteInput {
  clientRequestId?: string;
  newContact: NewExternalSaleQuoteContactInput;
  lines: ExternalSaleQuoteLineInput[];
  transportFee: number;
  adminFee: number;
  marginPct: number;
  introText?: string;
  termsText?: string;
}

export function createExternalSaleQuote(input: CreateExternalSaleQuoteInput): Promise<{ id: string; displayId: string }> {
  return apiFetch("/api/external-sale-quotes", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateExternalSaleQuoteInput {
  newContact?: NewExternalSaleQuoteContactInput;
  lines?: ExternalSaleQuoteLineInput[];
  transportFee?: number;
  adminFee?: number;
  marginPct?: number;
  introText?: string;
  termsText?: string;
}

export function updateExternalSaleQuote(id: string, input: UpdateExternalSaleQuoteInput): Promise<void> {
  return apiFetch(`/api/external-sale-quotes/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function sendExternalSaleQuote(id: string): Promise<void> {
  return apiFetch(`/api/external-sale-quotes/${id}/send`, { method: "POST" });
}

export function decideExternalSaleQuote(id: string, outcome: "accepted" | "declined"): Promise<void> {
  return apiFetch(`/api/external-sale-quotes/${id}/decide`, { method: "POST", body: JSON.stringify({ outcome }) });
}

/** Crée la vraie ExternalSale (VE-AAAA-NNNN) + ses PurchaseRequest — seulement une fois status==="accepted". */
export function convertExternalSaleQuoteToSale(id: string): Promise<{ id: string; displayId: string }> {
  return apiFetch(`/api/external-sale-quotes/${id}/convert`, { method: "POST" });
}

export function deleteExternalSaleQuote(id: string): Promise<void> {
  return apiFetch(`/api/external-sale-quotes/${id}`, { method: "DELETE" });
}
