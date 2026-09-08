import type { FulfillmentMode } from "@gsc-pilot/business-rules";
import { apiFetch } from "../../lib/apiClient.js";
import type { PurchaseRequestDto } from "../purchases/api.js";

// Libellés de fulfillment + formatCurrency réutilisés tels quels depuis
// projects/api.ts (mêmes valeurs que Project/Rolling — voir fulfillment.ts,
// jamais dupliqués) — même patron que rollings/RollingDetail.tsx.
export { FULFILLMENT_MODE_LABELS, FULFILLMENT_STATUS_LABELS, formatCurrency } from "../projects/api.js";
export type { FulfillmentMode };

// Deux seules valeurs possibles (fulfillment.ts, jamais d'autre transition) — même patron que projects/api.ts.
export const EXTERNAL_SALE_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  ready_invoice: "Prêt à facturer",
};

export interface NextExternalSaleNumberDto {
  nextDisplayId: string;
  defaultMarginPct: number;
}

export function fetchNextExternalSaleNumber(): Promise<NextExternalSaleNumberDto> {
  return apiFetch("/api/external-sales/next-number");
}

export interface ExternalSaleListItemDto {
  id: string;
  displayId: string;
  contactName: string;
  company: string | null;
  status: string;
  readyToDeliver: boolean;
  salePrice: number;
  createdAt: string;
}

export function fetchExternalSales(): Promise<{ externalSales: ExternalSaleListItemDto[] }> {
  return apiFetch("/api/external-sales");
}

export interface ExternalSaleDetailDto {
  id: string;
  displayId: string;
  contactId: string;
  contactName: string;
  company: string | null;
  clientRequestId: string | null;
  partsBaseCost: number;
  transportFee: number;
  adminFee: number;
  marginPct: number;
  salePrice: number;
  readyToDeliver: boolean;
  status: string;
  fulfillmentMode: FulfillmentMode | null;
  fulfillmentStatus: string | null;
  fulfillmentDriverId: string | null;
  fulfillmentAddress: string | null;
  fulfillmentScheduled: string | null;
  billingReady: boolean;
  fulfillmentConfirmationNote: string | null;
  createdAt: string;
  lines: PurchaseRequestDto[];
}

/** Route renvoie le DTO directement (pas de wrapper { externalSale }) — voir apps/api/src/modules/externalSales/routes.ts. */
export function fetchExternalSaleDetail(id: string): Promise<ExternalSaleDetailDto> {
  return apiFetch(`/api/external-sales/${id}`);
}

export interface ExternalSaleLineInput {
  description: string;
  qty: number;
  unitCost: number;
}

export interface NewExternalSaleContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

export interface CreateExternalSaleInput {
  clientRequestId?: string;
  newContact: NewExternalSaleContactInput;
  lines: ExternalSaleLineInput[];
  transportFee: number;
  adminFee: number;
  marginPct: number;
}

export function createExternalSale(input: CreateExternalSaleInput): Promise<{ id: string; displayId: string }> {
  return apiFetch("/api/external-sales", { method: "POST", body: JSON.stringify(input) });
}

export function markExternalSaleReadyToDeliver(id: string): Promise<void> {
  return apiFetch(`/api/external-sales/${id}/ready-to-deliver`, { method: "POST" });
}

export interface ChooseExternalSaleFulfillmentInput {
  mode: FulfillmentMode;
  driverId?: string;
  address?: string;
  scheduled?: string;
}

export function chooseExternalSaleFulfillmentMode(id: string, input: ChooseExternalSaleFulfillmentInput): Promise<void> {
  return apiFetch(`/api/external-sales/${id}/fulfillment`, { method: "POST", body: JSON.stringify(input) });
}

export function confirmExternalSaleFulfillment(id: string, note?: string): Promise<void> {
  return apiFetch(`/api/external-sales/${id}/fulfillment/confirm`, { method: "POST", body: JSON.stringify({ note }) });
}
