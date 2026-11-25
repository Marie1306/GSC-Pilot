import { apiFetch } from "../../lib/apiClient.js";
import { formatCurrency } from "../budgets/api.js";

export { formatCurrency };

export interface ExternalSaleConfirmationLineDto {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
}

export interface ExternalSaleConfirmationDetailDto {
  id: string;
  displayId: string;
  quoteId: string;
  quoteDisplayId: string;
  clientPoNumber: string | null;
  introText: string | null;
  termsText: string | null;
  contactName: string;
  company: string | null;
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  amountBeforeTax: number;
  tpsAmount: number;
  tvqAmount: number;
  totalWithTax: number;
  createdAt: string;
  lines: ExternalSaleConfirmationLineDto[];
}

export function fetchConfirmationForExternalSaleQuote(quoteId: string): Promise<{ confirmation: ExternalSaleConfirmationDetailDto | null }> {
  return apiFetch(`/api/external-sale-quotes/${quoteId}/confirmation`);
}

export function fetchExternalSaleConfirmationDetail(id: string): Promise<{ confirmation: ExternalSaleConfirmationDetailDto }> {
  return apiFetch(`/api/external-sale-confirmations/${id}`);
}

export interface ConvertExternalSaleQuoteToConfirmationInput {
  clientPoNumber?: string;
}

export function convertExternalSaleQuoteToConfirmation(
  quoteId: string,
  input: ConvertExternalSaleQuoteToConfirmationInput,
): Promise<{ confirmation: ExternalSaleConfirmationDetailDto }> {
  return apiFetch(`/api/external-sale-quotes/${quoteId}/confirmation`, { method: "POST", body: JSON.stringify(input) });
}

export function deleteExternalSaleConfirmation(id: string): Promise<void> {
  return apiFetch(`/api/external-sale-confirmations/${id}`, { method: "DELETE" });
}
