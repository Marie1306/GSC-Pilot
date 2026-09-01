/**
 * GSC Pilot — Contacts (19 août 2026)
 *
 * Carnet d'adresses (confirmé, spécification section « Contacts ») —
 * simple, pas d'ambiguïté. La plupart des contacts s'enregistrent déjà
 * automatiquement (ensureContact, voir clientRequests/service.ts, appelé
 * aussi par budgets/serviceCalls) — ce module ajoute la consultation
 * (avec les dossiers liés : demandes, projets, roulements, appels de
 * service, livraisons) et la création/modification manuelle, nécessaire
 * pour les contacts jamais créés par ce mécanisme (ex. fournisseurs).
 *
 * Permission unique (canAccessOverviewViews, roles.ts) — déjà celle
 * utilisée par nav.ts pour cette page, pas de distinction consultation/
 * modification confirmée.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { serviceCallDisplayTitle } from "../serviceCalls/service.js";
import type { Contact, Prisma } from "../../generated/prisma/client.js";

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

function toListItemDto(contact: Contact): ContactListItemDto {
  return {
    id: contact.id,
    type: contact.type,
    company: contact.company,
    name: contact.name,
    role: contact.role,
    email: contact.email,
    phone: contact.phone,
    categories: contact.categories,
    createdAt: contact.createdAt.toISOString(),
  };
}

export async function listContacts(): Promise<ContactListItemDto[]> {
  const contacts = await prisma.contact.findMany({ orderBy: { name: "asc" } });
  return contacts.map(toListItemDto);
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

export async function getContactDetail(id: string): Promise<ContactDetailDto> {
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      clientRequests: { orderBy: { createdAt: "desc" } },
      projects: { orderBy: { createdAt: "desc" } },
      rollings: { orderBy: { createdAt: "desc" } },
      serviceCalls: { orderBy: { createdAt: "desc" } },
      deliveries: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!contact) throw new HttpError(404, "Contact introuvable.");

  return {
    ...toListItemDto(contact),
    clientRequests: contact.clientRequests.map((row) => ({
      id: row.id,
      displayId: row.displayId,
      status: row.status,
      label: row.summary,
      createdAt: row.createdAt.toISOString(),
    })),
    projects: contact.projects.map((row) => ({
      id: row.id,
      displayId: row.projectNumber,
      status: row.status,
      label: row.name,
      createdAt: row.createdAt.toISOString(),
    })),
    // rollingNumber (RL-AAAA-NNNN) existe depuis le 31 août 2026 — avant
    // cette date, Rolling n'avait pas encore de numéro d'affichage et ce
    // champ retombait sur un texte générique "Roulement" (jamais un
    // identifiant tronqué présenté comme un vrai numéro).
    rollings: contact.rollings.map((row) => ({
      id: row.id,
      displayId: row.rollingNumber,
      status: row.status,
      label: `Vendu ${Number(row.sold).toFixed(2)} $`,
      createdAt: row.createdAt.toISOString(),
    })),
    serviceCalls: contact.serviceCalls.map((row) => ({
      id: row.id,
      displayId: row.displayId,
      status: row.status,
      label: serviceCallDisplayTitle(row),
      createdAt: row.createdAt.toISOString(),
    })),
    deliveries: contact.deliveries.map((row) => ({
      id: row.id,
      displayId: row.displayId,
      status: row.status,
      label: row.address ?? row.type,
      createdAt: row.createdAt.toISOString(),
    })),
  };
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

export async function createContact(input: ContactInput): Promise<ContactListItemDto> {
  if (!input.name?.trim()) throw new HttpError(400, "Le nom est requis.");
  const contact = await prisma.contact.create({
    data: {
      type: input.type || "Client",
      name: input.name.trim(),
      company: input.company?.trim() || null,
      role: input.role?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      categories: input.categories ?? [],
    },
  });
  return toListItemDto(contact);
}

export interface ContactUpdateInput {
  type?: string;
  name?: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  categories?: string[];
}

export async function updateContact(id: string, patch: ContactUpdateInput): Promise<ContactListItemDto> {
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Contact introuvable.");
  if (patch.name !== undefined && !patch.name.trim()) throw new HttpError(400, "Le nom est requis.");

  const data: Prisma.ContactUpdateInput = {};
  if (patch.type !== undefined) data.type = patch.type;
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.company !== undefined) data.company = patch.company?.trim() || null;
  if (patch.role !== undefined) data.role = patch.role?.trim() || null;
  if (patch.email !== undefined) data.email = patch.email?.trim() || null;
  if (patch.phone !== undefined) data.phone = patch.phone?.trim() || null;
  if (patch.categories !== undefined) data.categories = patch.categories;

  const contact = await prisma.contact.update({ where: { id }, data });
  return toListItemDto(contact);
}
