import { apiFetch } from "../../lib/apiClient.js";

export interface ServiceCallListItemDto {
  id: string;
  displayId: string;
  status: string;
  contactName: string;
  company: string | null;
  request: string;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  scheduledAt: string | null;
  createdAt: string;
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
  request: string;
  assignedEmployeeId?: string;
  scheduledAt?: string;
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

export interface ServiceCallDetailDto {
  id: string;
  displayId: string;
  status: string;
  contactId: string;
  contactName: string;
  company: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  request: string;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  scheduledAt: string | null;
  startAt: string | null;
  endAt: string | null;
  kmTraveled: number | null;
  mealsClaimed: string[];
  summary: string | null;
  signatureCaptured: boolean;
  signatureImageUrl: string | null;
  ownerApprovedByName: string | null;
  ownerApprovedAt: string | null;
  sentToAdminAt: string | null;
  parts: ServiceCallPartDto[];
  photos: ServiceCallPhotoDto[];
  timeEntries: ServiceCallTimeEntryDto[];
  totals: ServiceCallTotalsDto;
  createdAt: string;
}

export function fetchServiceCallDetail(id: string): Promise<{ serviceCall: ServiceCallDetailDto }> {
  return apiFetch(`/api/service-calls/${id}`);
}

export const MEAL_LABELS: Record<string, string> = { breakfast: "Déjeuner", lunch: "Dîner", dinner: "Souper" };

export interface UpdateServiceCallInput {
  assignedEmployeeId?: string | null;
  scheduledAt?: string | null;
  kmTraveled?: number | null;
  mealsClaimed?: string[];
  summary?: string | null;
}

export function updateServiceCall(id: string, patch: UpdateServiceCallInput): Promise<void> {
  return apiFetch(`/api/service-calls/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function addServiceCallPart(id: string, input: { name: string; qty: number; unit?: string }): Promise<{ part: ServiceCallPartDto }> {
  return apiFetch(`/api/service-calls/${id}/parts`, { method: "POST", body: JSON.stringify(input) });
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

export function captureServiceCallSignature(id: string, dataUrl: string): Promise<void> {
  return apiFetch(`/api/service-calls/${id}/signature`, { method: "POST", body: JSON.stringify({ dataUrl }) });
}

export function approveServiceCall(id: string): Promise<void> {
  return apiFetch(`/api/service-calls/${id}/approve`, { method: "POST" });
}

export function sendServiceCallToAdmin(id: string): Promise<void> {
  return apiFetch(`/api/service-calls/${id}/send-to-admin`, { method: "POST" });
}
