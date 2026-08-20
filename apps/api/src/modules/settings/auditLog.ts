/**
 * Paramètres — journal d'audit (AuditLogEntry, audit-log.ts jamais modifié).
 * Écrit aujourd'hui à deux endroits réels : refus de permission
 * (auth/middleware.ts, purchases/routes.ts) et réassignation d'un punch
 * (timeEntries/service.ts) — lecture seule ici, Direction seulement, aucune
 * nouvelle écriture ajoutée par ce module.
 */
import { prisma } from "../../db.js";

export interface AuditLogEntryDto {
  id: string;
  at: string;
  actorName: string;
  actorPersona: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: unknown;
  justification: string | null;
}

export async function listAuditLog(limit = 200): Promise<AuditLogEntryDto[]> {
  const rows = await prisma.auditLogEntry.findMany({
    include: { actor: { select: { name: true } } },
    orderBy: { at: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString(),
    actorName: row.actor.name,
    actorPersona: row.actorPersona,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    meta: row.meta,
    justification: row.justification,
  }));
}
