/**
 * GSC Pilot — Notes internes (29 août 2026, nouveau module demandé par
 * l'utilisatrice) — message court d'un employé à un autre, ou à tout un rôle
 * à la fois (chaque personne de ce rôle reçoit alors sa propre copie
 * indépendante, archivée à sa propre lecture — jamais une note partagée).
 *
 * Accessible à tous les rôles — aucune permission dédiée dans roles.ts au
 * niveau de l'envoi/réception (voir schema.prisma, en-tête du modèle
 * TeamNote). Seule la page Centre d'actions elle-même a besoin d'une
 * permission (canAccessActionCenter, allow-all) pour que tout le monde
 * puisse l'atteindre — voir actionCenter/routes.ts, inchangé par ce module.
 */
import { ROLES, type Persona } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

const PERSONA_LABELS: Record<Persona, string> = {
  [ROLES.OWNER]: "Direction",
  [ROLES.ADMIN]: "Administration",
  [ROLES.BOSS]: "Propriétaire",
  [ROLES.MEMBER]: "Employé",
  [ROLES.WAREHOUSE]: "Magasinier",
};

export interface TeamNoteRecipientOptionDto {
  id: string;
  name: string;
  persona: Persona;
}

/** Employés actifs sélectionnables comme destinataire précis — jamais soi-même. */
export async function listRecipientOptions(excludeEmployeeId: string): Promise<TeamNoteRecipientOptionDto[]> {
  const employees = await prisma.employee.findMany({
    where: { active: true, id: { not: excludeEmployeeId } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, persona: true },
  });
  return employees;
}

export interface SendTeamNoteInput {
  recipientId?: string;
  recipientPersona?: Persona;
  body: string;
}

export interface TeamNoteDto {
  id: string;
  senderId: string;
  senderName: string;
  senderPersona: Persona;
  body: string;
  createdAt: string;
  readAt: string | null;
}

function toDto(note: {
  id: string;
  senderId: string;
  sender: { name: string; persona: Persona };
  body: string;
  createdAt: Date;
  readAt: Date | null;
}): TeamNoteDto {
  return {
    id: note.id,
    senderId: note.senderId,
    senderName: note.sender.name,
    senderPersona: note.sender.persona,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    readAt: note.readAt?.toISOString() ?? null,
  };
}

/**
 * Envoie une note à un employé précis OU à tout un rôle (une copie
 * indépendante par personne active de ce rôle, expéditeur toujours exclu —
 * confirmé par l'utilisatrice le 29 août 2026). Retourne le nombre réel de
 * destinataires, affiché ensuite par l'interface.
 */
export async function sendTeamNote(senderId: string, input: SendTeamNoteInput): Promise<{ recipientCount: number }> {
  const body = input.body.trim();
  if (!body) throw new HttpError(400, "Le texte de la note ne peut pas être vide.");
  if (!input.recipientId && !input.recipientPersona) {
    throw new HttpError(400, "Choisir un employé précis ou un rôle destinataire.");
  }
  if (input.recipientId && input.recipientPersona) {
    throw new HttpError(400, "Choisir un employé précis OU un rôle, pas les deux.");
  }

  let recipientIds: string[];
  if (input.recipientId) {
    if (input.recipientId === senderId) throw new HttpError(400, "Impossible de s'envoyer une note à soi-même.");
    const recipient = await prisma.employee.findFirst({ where: { id: input.recipientId, active: true } });
    if (!recipient) throw new HttpError(404, "Destinataire introuvable.");
    recipientIds = [recipient.id];
  } else {
    const members = await prisma.employee.findMany({
      where: { active: true, persona: input.recipientPersona, id: { not: senderId } },
      select: { id: true },
    });
    if (members.length === 0) {
      throw new HttpError(400, `Aucun autre employé actif dans le rôle ${PERSONA_LABELS[input.recipientPersona!]}.`);
    }
    recipientIds = members.map((member) => member.id);
  }

  await prisma.teamNote.createMany({
    data: recipientIds.map((recipientId) => ({ senderId, recipientId, body })),
  });
  return { recipientCount: recipientIds.length };
}

export interface TeamNoteInboxDto {
  active: TeamNoteDto[];
  recentArchived: TeamNoteDto[];
}

const NOTE_INCLUDE = { sender: { select: { name: true, persona: true } } } as const;
const RECENT_ARCHIVED_LIMIT = 5;

/** Notes reçues par l'employé — actives (Centre d'actions) + 5 dernières archivées (historique compact). */
export async function getInbox(employeeId: string): Promise<TeamNoteInboxDto> {
  const [active, recentArchived] = await Promise.all([
    prisma.teamNote.findMany({
      where: { recipientId: employeeId, readAt: null },
      include: NOTE_INCLUDE,
      orderBy: { createdAt: "desc" },
    }),
    prisma.teamNote.findMany({
      where: { recipientId: employeeId, readAt: { not: null } },
      include: NOTE_INCLUDE,
      orderBy: { readAt: "desc" },
      take: RECENT_ARCHIVED_LIMIT,
    }),
  ]);
  return { active: active.map(toDto), recentArchived: recentArchived.map(toDto) };
}

/** Historique complet des notes archivées de l'employé — bouton "Afficher toutes les notes". */
export async function getAllArchived(employeeId: string): Promise<TeamNoteDto[]> {
  const notes = await prisma.teamNote.findMany({
    where: { recipientId: employeeId, readAt: { not: null } },
    include: NOTE_INCLUDE,
    orderBy: { readAt: "desc" },
  });
  return notes.map(toDto);
}

/** Bouton "✓ Reçu" — archive la note (idempotent, un deuxième clic ne fait rien). */
export async function markTeamNoteRead(employeeId: string, noteId: string): Promise<void> {
  const note = await prisma.teamNote.findUnique({ where: { id: noteId } });
  if (!note) throw new HttpError(404, "Note introuvable.");
  if (note.recipientId !== employeeId) throw new HttpError(403, "Cette note ne vous est pas destinée.");
  if (note.readAt) return;
  await prisma.teamNote.update({ where: { id: noteId }, data: { readAt: new Date() } });
}
