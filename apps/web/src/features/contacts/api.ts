import { apiFetch } from "../../lib/apiClient.js";

export interface ContactListItemDto {
  id: string;
  type: string;
  company: string | null;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  categories: string[];
  createdAt: string;
}

export function fetchContacts(): Promise<{ contacts: ContactListItemDto[] }> {
  return apiFetch("/api/contacts");
}

export interface LinkedRecordDto {
  id: string;
  displayId: string;
  status: string;
  label: string;
  createdAt: string;
}

export interface ContactDetailDto extends ContactListItemDto {
  clientRequests: LinkedRecordDto[];
  projects: LinkedRecordDto[];
  rollings: LinkedRecordDto[];
  serviceCalls: LinkedRecordDto[];
  deliveries: LinkedRecordDto[];
}

export function fetchContactDetail(id: string): Promise<{ contact: ContactDetailDto }> {
  return apiFetch(`/api/contacts/${id}`);
}

export interface ContactInput {
  type: string;
  name: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  categories?: string[];
}

export function createContact(input: ContactInput): Promise<{ contact: ContactListItemDto }> {
  return apiFetch("/api/contacts", { method: "POST", body: JSON.stringify(input) });
}

export function updateContact(id: string, patch: Partial<ContactInput>): Promise<{ contact: ContactListItemDto }> {
  return apiFetch(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}
