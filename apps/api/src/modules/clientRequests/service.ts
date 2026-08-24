/**
 * Demandes clients — création/liste/consultation avec notes (12 août 2026).
 * Champs et valeurs de menus déroulants vérifiés directement dans le
 * prototype v19 (docs/handoff/04-reference-v19), pas devinés. Portée
 * confirmée avec l'utilisatrice : assignation à un employé et conversion
 * en budgétaire/projet/roulement reportées à la construction de ces
 * fonctionnalités — champs déjà réservés dans le schéma
 * (assignedEmployeeId, budgetId, convertedType, ...), ne pas oublier.
 */
import { ensureContact, type Contact as PlainContact, type EnsureContactInput } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { ClientRequest, Contact, Prisma } from "../../generated/prisma/client.js";

export const REQUEST_TYPES = ["project", "rolling", "service", "information"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const URGENCIES = ["urgent", "normal", "discuss"] as const;
export type Urgency = (typeof URGENCIES)[number];

/** "converted" existe dans le schéma pour la future conversion en budgétaire — pas encore une action manuelle. */
export const SETTABLE_STATUSES = ["new", "in_progress", "lost"] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

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
  nextFollowUp?: Date;
  summary: string;
}

/**
 * Adaptateur DB pour ensureContact (contacts.ts, fonction pure — jamais
 * modifiée) : charge les contacts candidats (par courriel puis nom,
 * comme le fait la fonction elle-même), la laisse déduplique/fusionner
 * en mémoire, puis écrit le résultat — une mise à jour si un contact
 * existant a été retrouvé (identité d'objet), sinon une création.
 */
/** Exportée pour que budgets/service.ts puisse résoudre le contact AVANT d'ouvrir sa propre transaction (voir createClientRequestInTx ci-dessous). */
export async function ensureContactRow(input: EnsureContactInput): Promise<Contact> {
  const email = input.email?.trim().toLowerCase();
  const name = (input.contactName || input.name || "").trim();

  const orClauses = [
    email ? { email: { equals: email, mode: "insensitive" as const } } : null,
    name ? { name: { equals: name, mode: "insensitive" as const } } : null,
  ].filter((clause): clause is NonNullable<typeof clause> => clause !== null);

  const candidates = orClauses.length > 0 ? await prisma.contact.findMany({ where: { OR: orClauses } }) : [];

  const rowByPlain = new Map<PlainContact, Contact>();
  const plainContacts: PlainContact[] = candidates.map((row) => {
    const plain: PlainContact = {
      id: row.id,
      type: row.type,
      company: row.company ?? "",
      name: row.name,
      role: row.role ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      categories: row.categories,
    };
    rowByPlain.set(plain, row);
    return plain;
  });

  const result = ensureContact(plainContacts, input);
  const matchedRow = rowByPlain.get(result);

  if (matchedRow) {
    return prisma.contact.update({
      where: { id: matchedRow.id },
      data: {
        phone: result.phone || null,
        email: result.email || null,
        company: result.company || null,
        role: result.role || null,
        categories: result.categories,
      },
    });
  }

  return prisma.contact.create({
    data: {
      type: result.type,
      company: result.company || null,
      name: result.name,
      role: result.role || null,
      email: result.email || null,
      phone: result.phone || null,
      categories: result.categories,
    },
  });
}

/**
 * Cœur transactionnel de la création — accepte un client de transaction
 * (celui de l'appelant, ou `prisma` lui-même) pour que la création d'une
 * demande client puisse participer à une transaction PLUS LARGE (voir
 * budgets/service.ts::createBudget) au lieu de toujours commettre pour de
 * bon avant que le reste de l'opération soit connu comme réussie. Corrige
 * un bug réel (12 août 2026) : une demande client créée ici, suivie d'un
 * échec dans createBudget, restait enregistrée pour de bon sans budgétaire
 * attaché — voir l'audit livré à l'utilisatrice le même jour.
 */
/** Aperçu du prochain numéro — jamais incrémenté (voir /projects/next-number, même patron). */
export async function getNextClientRequestDisplayId(): Promise<string> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const year = new Date().getFullYear();
  return `DC-${year}-${String(settings.nextClientRequestNumber).padStart(4, "0")}`;
}

export async function createClientRequestInTx(
  tx: Prisma.TransactionClient,
  createdById: string,
  input: CreateClientRequestInput,
  contactId: string,
): Promise<ClientRequest> {
  const settings = await tx.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const year = new Date().getFullYear();
  const displayId = `DC-${year}-${String(settings.nextClientRequestNumber).padStart(4, "0")}`;

  const row = await tx.clientRequest.create({
    data: {
      displayId,
      createdById,
      contactId,
      contactName: input.contactName.trim(),
      contactRole: input.contactRole?.trim() || null,
      company: input.company.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      address: input.address?.trim() || null,
      summary: input.summary.trim(),
      requestType: input.requestType,
      urgency: input.urgency,
      salesChannelId: input.salesChannelId,
      sourceDetail: input.sourceDetail?.trim() || null,
      nextFollowUp: input.nextFollowUp ?? null,
      status: "new",
    },
  });

  await tx.settings.update({
    where: { id: settings.id },
    data: { nextClientRequestNumber: settings.nextClientRequestNumber + 1 },
  });

  return row;
}

/** Validations et résolution du contact AVANT toute écriture — mêmes étapes que l'ancienne version, exposées pour budgets/service.ts. */
export async function resolveClientRequestContact(input: Pick<CreateClientRequestInput, "salesChannelId" | "email" | "contactName" | "company" | "contactRole" | "phone" | "requestType">): Promise<Contact> {
  const channel = await prisma.salesChannel.findUnique({ where: { id: input.salesChannelId } });
  if (!channel || !channel.active) throw new HttpError(400, "Canal d'entrée invalide.");

  return ensureContactRow({
    email: input.email,
    contactName: input.contactName,
    company: input.company,
    contactRole: input.contactRole,
    phone: input.phone,
    requestType: input.requestType,
  });
}

export async function createClientRequest(createdById: string, input: CreateClientRequestInput): Promise<ClientRequest> {
  const contact = await resolveClientRequestContact(input);
  return prisma.$transaction((tx) => createClientRequestInTx(tx, createdById, input, contact.id));
}

export interface ClientRequestListItemDto {
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
  /** Exposé pour que le module Budgétaire puisse exclure les demandes déjà liées à un budgétaire de son sélecteur. */
  budgetId: string | null;
  /** Exposé pour le Centre d'actions (21 août 2026) — une demande transférée, pas encore convertie, doit apparaître au centre d'actions du Propriétaire. */
  transmittedToOwnerAt: string | null;
}

type ClientRequestRow = ClientRequest & { salesChannel: { name: string } | null };

function toListItemDto(row: ClientRequestRow, createdByName: string): ClientRequestListItemDto {
  return {
    id: row.id,
    displayId: row.displayId,
    contactName: row.contactName,
    company: row.company,
    requestType: row.requestType,
    urgency: row.urgency,
    status: row.status,
    channelName: row.salesChannel?.name ?? null,
    summary: row.summary,
    createdByName,
    createdAt: row.createdAt.toISOString(),
    nextFollowUp: row.nextFollowUp?.toISOString() ?? null,
    budgetId: row.budgetId,
    transmittedToOwnerAt: row.transmittedToOwnerAt?.toISOString() ?? null,
  };
}

async function namesByEmployeeId(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids)];
  const employees = await prisma.employee.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
  return new Map(employees.map((employee) => [employee.id, employee.name]));
}

/**
 * Visibilité : identique pour Direction/Administration/Propriétaire, aucun
 * filtrage par créateur — confirmé le 12 août 2026. Corbeille (deletedAt)
 * exclue, même patron que listProjects. Demandes converties (statut
 * "converted", posé automatiquement dans createBudget) exclues aussi
 * (18 août 2026, confirmé) — restent consultables individuellement via
 * getClientRequestDetail, seulement sorties de cette liste active.
 */
export async function listClientRequests(): Promise<ClientRequestListItemDto[]> {
  const rows = await prisma.clientRequest.findMany({
    where: { deletedAt: null, status: { not: "converted" } },
    include: { salesChannel: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const nameById = await namesByEmployeeId(rows.map((row) => row.createdById));
  return rows.map((row) => toListItemDto(row, nameById.get(row.createdById) ?? "—"));
}

export interface ClientRequestNoteDto {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ClientRequestDetailDto extends ClientRequestListItemDto {
  contactRole: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  sourceDetail: string | null;
  lostReason: string | null;
  notes: ClientRequestNoteDto[];
  deletedAt: string | null;
}

export async function getClientRequestDetail(id: string): Promise<ClientRequestDetailDto> {
  const row = await prisma.clientRequest.findUnique({
    where: { id },
    include: { salesChannel: { select: { name: true } }, notes: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) throw new HttpError(404, "Demande client introuvable.");

  const nameById = await namesByEmployeeId([row.createdById, ...row.notes.map((note) => note.authorId)]);

  return {
    ...toListItemDto(row, nameById.get(row.createdById) ?? "—"),
    contactRole: row.contactRole,
    email: row.email,
    phone: row.phone,
    address: row.address,
    sourceDetail: row.sourceDetail,
    lostReason: row.lostReason,
    notes: row.notes.map((note) => ({
      id: note.id,
      authorId: note.authorId,
      authorName: nameById.get(note.authorId) ?? "—",
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    })),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export async function addClientRequestNote(clientRequestId: string, authorId: string, body: string): Promise<ClientRequestNoteDto> {
  const request = await prisma.clientRequest.findUnique({ where: { id: clientRequestId }, select: { id: true } });
  if (!request) throw new HttpError(404, "Demande client introuvable.");

  const note = await prisma.clientRequestNote.create({ data: { clientRequestId, authorId, body: body.trim() } });
  const author = await prisma.employee.findUnique({ where: { id: authorId }, select: { name: true } });
  return { id: note.id, authorId, authorName: author?.name ?? "—", body: note.body, createdAt: note.createdAt.toISOString() };
}

export async function updateClientRequestStatus(id: string, status: SettableStatus, lostReason?: string): Promise<ClientRequest> {
  const request = await prisma.clientRequest.findUnique({ where: { id } });
  if (!request) throw new HttpError(404, "Demande client introuvable.");
  return prisma.clientRequest.update({
    where: { id },
    data: { status, lostReason: status === "lost" ? lostReason?.trim() || null : request.lostReason },
  });
}

// ---------------------------------------------------------------------------
// Transfert au Propriétaire / relance / corbeille (18 août 2026) — champs
// réservés au schéma depuis le 12 août, reportés jusqu'à maintenant (confirmé
// avec l'utilisatrice : « reste un suivi actif, pas oublié »).
// ---------------------------------------------------------------------------

/** transmittedToOwnerAt : visibilité seulement, jamais une porte de permission (voir schema.prisma) — simple horodatage, pas de retour en arrière prévu (aucun besoin exprimé). */
export async function transferClientRequestToOwner(id: string): Promise<void> {
  const request = await prisma.clientRequest.findUnique({ where: { id }, select: { id: true } });
  if (!request) throw new HttpError(404, "Demande client introuvable.");
  await prisma.clientRequest.update({ where: { id }, data: { transmittedToOwnerAt: new Date() } });
}

export async function updateClientRequestFollowUp(id: string, nextFollowUp: Date | null): Promise<void> {
  const request = await prisma.clientRequest.findUnique({ where: { id }, select: { id: true } });
  if (!request) throw new HttpError(404, "Demande client introuvable.");
  await prisma.clientRequest.update({ where: { id }, data: { nextFollowUp } });
}

/** Corbeille — même mécanisme que Project.deletedAt (masqué des listes actives, jamais une suppression physique). Bloqué une fois convertie en budgétaire — l'historique de la conversion doit rester intact. */
export async function deleteClientRequest(id: string): Promise<void> {
  const request = await prisma.clientRequest.findUnique({ where: { id } });
  if (!request) throw new HttpError(404, "Demande client introuvable.");
  if (request.deletedAt) throw new HttpError(400, "Cette demande est déjà dans la corbeille.");
  if (request.budgetId) throw new HttpError(400, "Cette demande a déjà un budgétaire — elle ne peut plus être supprimée.");
  await prisma.clientRequest.update({ where: { id }, data: { deletedAt: new Date() } });
}
