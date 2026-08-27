import { apiFetch } from "../../lib/apiClient.js";

// Types locaux plutôt que des schémas zod partagés — même choix que le
// module achats (voir features/purchases/api.ts). Valeurs de requestType/
// urgency vérifiées dans le prototype v19, pas devinées.

export type RequestType = "project" | "rolling" | "service" | "information";
export type Urgency = "urgent" | "normal" | "discuss";
export type SettableStatus = "new" | "in_progress" | "lost";

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  project: "Projet",
  rolling: "Roulement",
  service: "Call de service",
  information: "Demande d'information",
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  urgent: "Urgent",
  normal: "Non urgent",
  discuss: "À discuter",
};

export const STATUS_LABELS: Record<string, string> = {
  new: "Nouvelle",
  in_progress: "En traitement",
  converted: "Convertie",
  lost: "Perdue",
};

export interface SalesChannelOption {
  id: string;
  name: string;
}

export interface ClientRequestListItem {
  id: string;
  displayId: string;
  contactName: string;
  company: string | null;
  requestType: string;
  urgency: string | null;
  status: string;
  channelName: string | null;
  summary: string;
  createdByName: string;
  createdAt: string;
  nextFollowUp: string | null;
  budgetId: string | null;
  serviceCallId: string | null;
}

export interface ClientRequestNote {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ClientRequestDetail extends ClientRequestListItem {
  contactRole: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  sourceDetail: string | null;
  lostReason: string | null;
  notes: ClientRequestNote[];
  transmittedToOwnerAt: string | null;
  deletedAt: string | null;
}

export interface CreateClientRequestInput {
  company: string;
  contactName: string;
  contactRole?: string;
  phone: string;
  email: string;
  address?: string;
  requestType: RequestType;
  urgency: Urgency;
  salesChannelId: string;
  sourceDetail?: string;
  nextFollowUp?: string;
  summary: string;
}

export function fetchNextClientRequestNumber(): Promise<{ nextDisplayId: string }> {
  return apiFetch("/api/client-requests/next-number");
}

export function fetchSalesChannels(): Promise<{ salesChannels: SalesChannelOption[] }> {
  return apiFetch("/api/sales-channels");
}

export function fetchClientRequests(): Promise<{ clientRequests: ClientRequestListItem[] }> {
  return apiFetch("/api/client-requests");
}

export function fetchClientRequestDetail(id: string): Promise<{ clientRequest: ClientRequestDetail }> {
  return apiFetch(`/api/client-requests/${id}`);
}

export function createClientRequest(input: CreateClientRequestInput): Promise<{ id: string; displayId: string }> {
  return apiFetch("/api/client-requests", { method: "POST", body: JSON.stringify(input) });
}

export function addClientRequestNote(id: string, body: string): Promise<{ note: ClientRequestNote }> {
  return apiFetch(`/api/client-requests/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) });
}

export function updateClientRequestStatus(
  id: string,
  status: SettableStatus,
  lostReason?: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(`/api/client-requests/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, lostReason }) });
}

export function transferClientRequestToOwner(id: string): Promise<void> {
  return apiFetch(`/api/client-requests/${id}/transfer-to-owner`, { method: "POST" });
}

export function updateClientRequestFollowUp(id: string, nextFollowUp: string | null): Promise<void> {
  return apiFetch(`/api/client-requests/${id}/follow-up`, { method: "PATCH", body: JSON.stringify({ nextFollowUp }) });
}

export function deleteClientRequest(id: string): Promise<void> {
  return apiFetch(`/api/client-requests/${id}`, { method: "DELETE" });
}
