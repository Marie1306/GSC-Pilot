/**
 * Paramètres — corbeille (2 septembre 2026). Chaque module métier gère déjà
 * sa propre suppression douce (deletedAt, jamais une suppression physique —
 * voir deleteProject/deleteBudget/deleteClientRequest/deleteServiceCall/
 * deleteRolling/deleteTimeEntry/deleteErrorReport) mais aucun écran ne
 * permettait de les revoir ni de les restaurer — les commentaires du schéma
 * le confirment tous ("l'écran de restauration... attend le module
 * Paramètres complet, hors de cette phase"). Rapporté par l'utilisatrice
 * (projet supprimé pour tester, aucun moyen de le récupérer ni de revoir son
 * numéro) — ce fichier construit cet écran, lecture + restauration seulement,
 * jamais une suppression définitive (hors de portée, jamais demandée).
 *
 * Restaurer ne fait QUE remettre deletedAt à null — ça n'annule pas les
 * effets de bord qu'une suppression a pu déclencher ailleurs. Le seul cas
 * réel aujourd'hui : deleteBudget décroche aussi la demande client liée
 * (ClientRequest.budgetId remis à nul, statut remis à "in_progress") —
 * restaurer le budgétaire ne referme pas ce lien automatiquement (la demande
 * a pu évoluer entre-temps — un nouveau budgétaire, par exemple). Les 6
 * autres types n'ont aucun effet de bord à la suppression, donc rien à
 * reconsidérer à la restauration.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

export const TRASH_ENTITY_TYPES = ["project", "clientRequest", "budget", "serviceCall", "rolling", "timeEntry", "errorReport"] as const;
export type TrashEntityType = (typeof TRASH_ENTITY_TYPES)[number];

export interface TrashItemDto {
  id: string;
  entityType: TrashEntityType;
  label: string;
  deletedAt: string;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function listTrash(): Promise<TrashItemDto[]> {
  const [projects, clientRequests, budgets, serviceCalls, rollings, timeEntries, errorReports] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, projectNumber: true, name: true, deletedAt: true },
    }),
    prisma.clientRequest.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, displayId: true, contactName: true, deletedAt: true },
    }),
    prisma.budget.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, displayId: true, deletedAt: true },
    }),
    prisma.serviceCall.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, displayId: true, deletedAt: true, contact: { select: { name: true } } },
    }),
    prisma.rolling.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, rollingNumber: true, deletedAt: true, contact: { select: { name: true } } },
    }),
    prisma.timeEntry.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, date: true, category: true, deletedAt: true, employee: { select: { name: true } } },
    }),
    prisma.errorReport.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, createdAt: true, deletedAt: true, employee: { select: { name: true } } },
    }),
  ]);

  const items: TrashItemDto[] = [
    ...projects.map((row) => ({
      id: row.id,
      entityType: "project" as const,
      label: `Projet ${row.projectNumber} — ${row.name}`,
      deletedAt: row.deletedAt!.toISOString(),
    })),
    ...clientRequests.map((row) => ({
      id: row.id,
      entityType: "clientRequest" as const,
      label: `Demande ${row.displayId} — ${row.contactName}`,
      deletedAt: row.deletedAt!.toISOString(),
    })),
    ...budgets.map((row) => ({
      id: row.id,
      entityType: "budget" as const,
      label: `Budgétaire ${row.displayId}`,
      deletedAt: row.deletedAt!.toISOString(),
    })),
    ...serviceCalls.map((row) => ({
      id: row.id,
      entityType: "serviceCall" as const,
      label: `Appel ${row.displayId} — ${row.contact.name}`,
      deletedAt: row.deletedAt!.toISOString(),
    })),
    ...rollings.map((row) => ({
      id: row.id,
      entityType: "rolling" as const,
      label: `Roulement ${row.rollingNumber} — ${row.contact.name}`,
      deletedAt: row.deletedAt!.toISOString(),
    })),
    ...timeEntries.map((row) => ({
      id: row.id,
      entityType: "timeEntry" as const,
      label: `Punch du ${isoDate(row.date)} — ${row.employee.name} (${row.category})`,
      deletedAt: row.deletedAt!.toISOString(),
    })),
    ...errorReports.map((row) => ({
      id: row.id,
      entityType: "errorReport" as const,
      label: `Rapport d'erreur — ${row.employee.name} (${isoDate(row.createdAt)})`,
      deletedAt: row.deletedAt!.toISOString(),
    })),
  ];

  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function restoreTrashItem(entityType: TrashEntityType, id: string): Promise<void> {
  switch (entityType) {
    case "project": {
      const project = await prisma.project.findUnique({ where: { id } });
      if (!project) throw new HttpError(404, "Projet introuvable.");
      if (!project.deletedAt) throw new HttpError(400, "Ce projet n'est pas dans la corbeille.");
      // projectNumber n'est plus @unique en DB (voir schema.prisma) — un autre
      // projet actif a pu légitimement réutiliser ce numéro depuis la suppression.
      const conflict = await prisma.project.findFirst({ where: { projectNumber: project.projectNumber, deletedAt: null, id: { not: id } } });
      if (conflict) throw new HttpError(409, `Impossible de restaurer — le numéro ${project.projectNumber} est maintenant utilisé par un autre projet.`);
      await prisma.project.update({ where: { id }, data: { deletedAt: null } });
      return;
    }
    case "clientRequest": {
      const row = await prisma.clientRequest.findUnique({ where: { id } });
      if (!row) throw new HttpError(404, "Demande client introuvable.");
      if (!row.deletedAt) throw new HttpError(400, "Cette demande n'est pas dans la corbeille.");
      await prisma.clientRequest.update({ where: { id }, data: { deletedAt: null } });
      return;
    }
    case "budget": {
      const row = await prisma.budget.findUnique({ where: { id } });
      if (!row) throw new HttpError(404, "Budgétaire introuvable.");
      if (!row.deletedAt) throw new HttpError(400, "Ce budgétaire n'est pas dans la corbeille.");
      await prisma.budget.update({ where: { id }, data: { deletedAt: null } });
      return;
    }
    case "serviceCall": {
      const row = await prisma.serviceCall.findUnique({ where: { id } });
      if (!row) throw new HttpError(404, "Appel de service introuvable.");
      if (!row.deletedAt) throw new HttpError(400, "Cet appel de service n'est pas dans la corbeille.");
      await prisma.serviceCall.update({ where: { id }, data: { deletedAt: null } });
      return;
    }
    case "rolling": {
      const row = await prisma.rolling.findUnique({ where: { id } });
      if (!row) throw new HttpError(404, "Roulement introuvable.");
      if (!row.deletedAt) throw new HttpError(400, "Ce roulement n'est pas dans la corbeille.");
      await prisma.rolling.update({ where: { id }, data: { deletedAt: null } });
      return;
    }
    case "timeEntry": {
      const row = await prisma.timeEntry.findUnique({ where: { id } });
      if (!row) throw new HttpError(404, "Punch introuvable.");
      if (!row.deletedAt) throw new HttpError(400, "Ce punch n'est pas dans la corbeille.");
      await prisma.timeEntry.update({ where: { id }, data: { deletedAt: null } });
      return;
    }
    case "errorReport": {
      const row = await prisma.errorReport.findUnique({ where: { id } });
      if (!row) throw new HttpError(404, "Rapport d'erreur introuvable.");
      if (!row.deletedAt) throw new HttpError(400, "Ce rapport d'erreur n'est pas dans la corbeille.");
      await prisma.errorReport.update({ where: { id }, data: { deletedAt: null } });
      return;
    }
  }
}
