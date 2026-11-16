import { apiFetch } from "../../lib/apiClient.js";
import type { InvoiceRequestPreviewDto } from "../projects/api.js";

export interface AssignedEmployeeDto {
  id: string;
  name: string;
}

/** Statut dérivé à la lecture (Chantier D, 16 novembre 2026) — remplace l'ancien champ status (scheduled/approved), mort au-delà de ces 2 valeurs et retiré du schéma. */
export type ServiceCallDerivedStatus = "none" | "in_progress" | "ready_to_invoice" | "invoiced";

export const SERVICE_CALL_STATUS_LABELS: Record<ServiceCallDerivedStatus, string> = {
  none: "Aucun bon de travail",
  in_progress: "En cours",
  ready_to_invoice: "Prêt à facturer",
  invoiced: "Facturé",
};

export interface ServiceCallListItemDto {
  id: string;
  displayId: string;
  derivedStatus: ServiceCallDerivedStatus;
  contactName: string;
  company: string | null;
  title: string;
  request: string;
  assignedEmployees: AssignedEmployeeDto[];
  bonsDeTravailCount: number;
  createdAt: string;
  // Visible seulement si canSeeServicePricing — agrégé sur tous les Bons de
  // travail du Call (Chantier D), pas juste un seul comme avant la refonte.
  salePrice?: number;
}

export function fetchNextServiceCallNumber(): Promise<{ nextDisplayId: string }> {
  return apiFetch("/api/service-calls/next-number");
}

export function fetchServiceCalls(): Promise<{ serviceCalls: ServiceCallListItemDto[] }> {
  return apiFetch("/api/service-calls");
}

export interface NewServiceCallContact {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

export interface CreateServiceCallInput {
  newContact: NewServiceCallContact;
  title: string;
  request: string;
  address?: string;
  /** Qui est censé s'occuper du dossier (gate la création d'un Bon de travail) — plus de scheduledAt ici, ça devient un champ du Bon de travail lui-même. */
  assignedEmployeeIds?: string[];
  /** Conversion directe depuis une demande client (27 août 2026) — voir ClientRequestOptionsMenu. */
  clientRequestId?: string;
  /** Call lié à un projet, sous-garantie (27 août 2026) — voir ProjectOptionsMenu. */
  projectId?: string;
  /** Call lié à un roulement (28 août 2026) — même mécanisme, voir RollingOptionsMenu. */
  rollingId?: string;
}

export function createServiceCall(input: CreateServiceCallInput): Promise<{ id: string; displayId: string }> {
  return apiFetch("/api/service-calls", { method: "POST", body: JSON.stringify(input) });
}

export interface ServiceCallPartDto {
  id: string;
  name: string;
  qty: number;
  unit: string | null;
  costPerUnit: number | null;
  salePricePerUnit: number | null;
  pricedAt: string | null;
}

export interface ServiceCallPhotoDto {
  id: string;
  storagePath: string;
  caption: string | null;
  uploadedAt: string;
}

export interface ServiceCallTimeEntryDto {
  id: string;
  date: string;
  employeeName: string;
  taskLabel: string | null;
  roundedMinutes: number | null;
  status: string;
}

export interface ServiceCallTotalsDto {
  laborHours: number;
  laborCost?: number;
  laborSale?: number;
  partsCost?: number;
  partsSale?: number;
  expenses?: number;
  totalCost?: number;
  totalSale?: number;
}

/** Résumé d'un Bon de travail affiché dans la liste du dossier (Call) — jamais de prix ici, voir BonDeTravailDetailDto pour les totaux. */
export interface BonDeTravailSummaryDto {
  id: string;
  displayId: string;
  scheduledAt: string | null;
  assignedEmployees: AssignedEmployeeDto[];
  signatureCaptured: boolean;
  approved: boolean;
  invoicePlanEntryId: string | null;
  invoiceNumber: string | null;
  createdAt: string;
}

/** Vue dossier (Call) — en-tête + liste de ses Bons de travail (Chantier D, 16 novembre 2026). */
export interface ServiceCallDetailDto {
  id: string;
  displayId: string;
  derivedStatus: ServiceCallDerivedStatus;
  contactId: string;
  contactName: string;
  company: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  projectId: string | null;
  rollingId: string | null;
  title: string;
  request: string;
  address: string | null;
  assignedEmployees: AssignedEmployeeDto[];
  bonsDeTravail: BonDeTravailSummaryDto[];
  createdAt: string;
}

export function fetchServiceCallDetail(id: string): Promise<{ serviceCall: ServiceCallDetailDto }> {
  return apiFetch(`/api/service-calls/${id}`);
}

export interface UpdateServiceCallInput {
  assignedEmployeeIds?: string[];
}

export function updateServiceCall(id: string, patch: UpdateServiceCallInput): Promise<void> {
  return apiFetch(`/api/service-calls/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteServiceCall(id: string): Promise<void> {
  return apiFetch(`/api/service-calls/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Bons de travail (Chantier D, 16 novembre 2026)
// ---------------------------------------------------------------------------

export interface CreateBonDeTravailInput {
  /** Omis : le technicien qui crée devient automatiquement l'assigné (voir backend). Direction peut choisir explicitement pour rattraper un oubli. */
  assignedEmployeeIds?: string[];
  scheduledAt?: string;
}

export function createBonDeTravail(serviceCallId: string, input: CreateBonDeTravailInput): Promise<{ id: string; displayId: string }> {
  return apiFetch(`/api/service-calls/${serviceCallId}/bons-travail`, { method: "POST", body: JSON.stringify(input) });
}

/** Détail riche d'un Bon de travail — toutes les données qui vivaient à plat sur ServiceCall avant la refonte. */
export interface BonDeTravailDetailDto {
  id: string;
  displayId: string;
  serviceCallId: string;
  serviceCallDisplayId: string;
  serviceCallTitle: string;
  contactName: string;
  company: string | null;
  assignedEmployees: AssignedEmployeeDto[];
  scheduledAt: string | null;
  startAt: string | null;
  endAt: string | null;
  kmTraveled: number | null;
  mealsBreakfastCount: number;
  mealsLunchCount: number;
  mealsDinnerCount: number;
  summary: string | null;
  signatureCaptured: boolean;
  signatureImageUrl: string | null;
  signatureSignerName: string | null;
  ownerApprovedByName: string | null;
  ownerApprovedAt: string | null;
  invoicePlanEntryId: string | null;
  invoiceNumber: string | null;
  parts: ServiceCallPartDto[];
  photos: ServiceCallPhotoDto[];
  timeEntries: ServiceCallTimeEntryDto[];
  totals: ServiceCallTotalsDto;
  createdAt: string;
}

export function fetchBonDeTravailDetail(id: string): Promise<{ bonDeTravail: BonDeTravailDetailDto }> {
  return apiFetch(`/api/service-calls/bons-travail/${id}`);
}

export interface UpdateBonDeTravailInput {
  assignedEmployeeIds?: string[];
  scheduledAt?: string | null;
  kmTraveled?: number | null;
  mealsBreakfastCount?: number;
  mealsLunchCount?: number;
  mealsDinnerCount?: number;
  summary?: string | null;
}

export function updateBonDeTravail(id: string, patch: UpdateBonDeTravailInput): Promise<void> {
  return apiFetch(`/api/service-calls/bons-travail/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function addServiceCallPart(bonDeTravailId: string, input: { name: string; qty: number; unit?: string }): Promise<{ part: ServiceCallPartDto }> {
  return apiFetch(`/api/service-calls/bons-travail/${bonDeTravailId}/parts`, { method: "POST", body: JSON.stringify(input) });
}

export function removeServiceCallPart(partId: string): Promise<void> {
  return apiFetch(`/api/service-calls/parts/${partId}`, { method: "DELETE" });
}

export function priceServiceCallPart(
  partId: string,
  input: { costPerUnit: number; marginPctOverride?: number },
): Promise<{ part: ServiceCallPartDto }> {
  return apiFetch(`/api/service-calls/parts/${partId}/price`, { method: "PATCH", body: JSON.stringify(input) });
}

export function captureBonDeTravailSignature(id: string, dataUrl: string, signerName: string): Promise<void> {
  return apiFetch(`/api/service-calls/bons-travail/${id}/signature`, { method: "POST", body: JSON.stringify({ dataUrl, signerName }) });
}

export function approveBonDeTravail(id: string): Promise<void> {
  return apiFetch(`/api/service-calls/bons-travail/${id}/approve`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Facturation sélective (Chantier D Partie 3, 16 novembre 2026) — Marie
// choisit lesquels des Bons de travail approuvés pas encore facturés vont
// sur une même facture. Réutilise RequestInvoiceModal.tsx telle quelle.
// ---------------------------------------------------------------------------

export interface InvoiceableBonDeTravailDto {
  id: string;
  displayId: string;
  scheduledAt: string | null;
  amount: number;
}

export function fetchInvoiceableBonsDeTravail(serviceCallId: string): Promise<{ bonsDeTravail: InvoiceableBonDeTravailDto[] }> {
  return apiFetch(`/api/service-calls/${serviceCallId}/invoiceable-bons-travail`);
}

export function previewServiceCallInvoiceForSelection(serviceCallId: string, bonDeTravailIds: string[]): Promise<{ preview: InvoiceRequestPreviewDto }> {
  return apiFetch(`/api/service-calls/${serviceCallId}/invoice-selection/preview`, { method: "POST", body: JSON.stringify({ bonDeTravailIds }) });
}

export function createServiceCallInvoiceForSelection(serviceCallId: string, bonDeTravailIds: string[], note?: string): Promise<void> {
  return apiFetch(`/api/service-calls/${serviceCallId}/invoice-selection/confirm`, { method: "POST", body: JSON.stringify({ bonDeTravailIds, note }) });
}
