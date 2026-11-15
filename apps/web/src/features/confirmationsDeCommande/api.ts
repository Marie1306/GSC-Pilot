import { apiFetch } from "../../lib/apiClient.js";
import { formatCurrency } from "../budgets/api.js";

export { formatCurrency };

export interface ConfirmationLineDto {
  id: string;
  label: string;
  qty: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
}

export interface ConfirmationDetailDto {
  id: string;
  displayId: string;
  soumissionId: string;
  soumissionDisplayId: string;
  clientPoNumber: string | null;
  introText: string | null;
  termsText: string | null;
  contactName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  amountBeforeTax: number;
  tpsAmount: number;
  tvqAmount: number;
  totalWithTax: number;
  createdAt: string;
  lines: ConfirmationLineDto[];
}

export function fetchConfirmationForSoumission(soumissionId: string): Promise<{ confirmation: ConfirmationDetailDto | null }> {
  return apiFetch(`/api/soumissions/${soumissionId}/confirmation`);
}

export function fetchConfirmationDetail(id: string): Promise<{ confirmation: ConfirmationDetailDto }> {
  return apiFetch(`/api/confirmations/${id}`);
}

export interface ConvertSoumissionInput {
  clientPoNumber?: string;
}

export function convertSoumissionToConfirmation(soumissionId: string, input: ConvertSoumissionInput): Promise<{ confirmation: ConfirmationDetailDto }> {
  return apiFetch(`/api/soumissions/${soumissionId}/confirmation`, { method: "POST", body: JSON.stringify(input) });
}

export function deleteConfirmationDeCommande(id: string): Promise<void> {
  return apiFetch(`/api/confirmations/${id}`, { method: "DELETE" });
}
