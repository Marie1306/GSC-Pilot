/**
 * GSC Pilot — Avenants (changements de commande, 21 août 2026)
 *
 * Réutilise amendments.ts tel quel : calculateAmendment (taux internes
 * fixes, back-up sur le taux GELÉ du projet — jamais celui des Paramètres,
 * bug historique documenté dans la spec), applyAmendmentToProject (addition
 * aux banques existantes + recalcul du plan de facturation sur pct×nouveau
 * total, jamais un remplacement), amendmentTasks, amendmentInvoiceRequest
 * (même mécanisme que les extras d'installation — InvoicePlanEntry.isExtra,
 * jamais construit avant maintenant : voir ProjectInvoicePlan.tsx, déjà prêt
 * à l'afficher). Numérotation AV-NNN, sans année (Settings.nextAmendmentNumber).
 */
import {
  calculateAmendment,
  applyAmendmentToProject,
  amendmentTasks,
  amendmentInvoiceRequest,
  productionCategoryLabel,
  canSeeFinancialValues,
  DEFAULT_BACKUP_RATE,
  type AmendmentProjectLike,
  type Persona,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { Amendment } from "../../generated/prisma/client.js";

export interface CreateAmendmentInput {
  hoursByCategory: Record<string, number>;
  marginPct: number;
  backupPct: number;
  purchases?: number;
}

export interface AmendmentDto {
  id: string;
  displayId: string;
  projectId: string;
  createdByName: string;
  createdAt: string;
  hoursByCategory: Record<string, number>;
  marginPct: number;
  backupPct: number;
  laborHours: number;
  backupEligibleHours: number;
  backupHours: number;
  purchases?: number;
  laborCost?: number;
  backupCost?: number;
  totalCost?: number;
  sale?: number;
}

function toDto(row: Amendment, createdByName: string, viewerPersona: Persona): AmendmentDto {
  const showFinancials = canSeeFinancialValues(viewerPersona);
  return {
    id: row.id,
    displayId: row.displayId,
    projectId: row.projectId,
    createdByName,
    createdAt: row.createdAt.toISOString(),
    hoursByCategory: row.hoursByCategory as Record<string, number>,
    marginPct: Number(row.marginPct),
    backupPct: Number(row.backupPct),
    laborHours: Number(row.laborHours),
    backupEligibleHours: Number(row.backupEligibleHours),
    backupHours: Number(row.backupHours),
    ...(showFinancials && {
      purchases: Number(row.purchases),
      laborCost: Number(row.laborCost),
      backupCost: Number(row.backupCost),
      totalCost: Number(row.totalCost),
      sale: Number(row.sale),
    }),
  };
}

export async function listAmendmentsForProject(projectId: string, viewerPersona: Persona): Promise<AmendmentDto[]> {
  const rows = await prisma.amendment.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  if (rows.length === 0) return [];
  const creators = await prisma.employee.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } });
  const nameById = new Map(creators.map((c) => [c.id, c.name]));
  return rows.map((row) => toDto(row, nameById.get(row.createdById) ?? "?", viewerPersona));
}

export async function createAmendment(projectId: string, createdById: string, input: CreateAmendmentInput, viewerPersona: Persona): Promise<AmendmentDto> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  if (Object.keys(input.hoursByCategory).length === 0) throw new HttpError(400, "Au moins une catégorie d'heures est requise.");

  const invoicePlanRows = await prisma.invoicePlanEntry.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  const projectLike: AmendmentProjectLike & { invoicePlan: { id: string; label: string; pct: number; amount: number }[] } = {
    laborHours: Number(project.laborHours),
    laborCost: Number(project.laborCost),
    backupHours: Number(project.backupHours),
    backupHoursCost: Number(project.backupHoursCost),
    plannedPurchases: Number(project.plannedPurchases),
    sold: Number(project.sold),
    invoicePlan: invoicePlanRows.map((r) => ({ id: r.id, label: r.label, pct: Number(r.pct), amount: Number(r.amount) })),
  };

  // projectBackupRate TOUJOURS le taux gelé du projet, jamais un input client
  // (bug historique documenté dans la spec — voir project.backupHourlyRate).
  const projectBackupRate = project.backupHourlyRate ? Number(project.backupHourlyRate) : DEFAULT_BACKUP_RATE;
  const calc = calculateAmendment(input.hoursByCategory, {
    marginPct: input.marginPct,
    backupPct: input.backupPct,
    projectBackupRate,
    purchases: input.purchases ?? 0,
  });
  applyAmendmentToProject(projectLike, calc);

  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const displayId = `AV-${String(settings.nextAmendmentNumber).padStart(3, "0")}`;

  const tasks = amendmentTasks(displayId, input.hoursByCategory);
  const invoiceRequest = amendmentInvoiceRequest(displayId, calc);

  const created = await prisma.$transaction(async (tx) => {
    const amendment = await tx.amendment.create({
      data: {
        displayId,
        projectId,
        createdById,
        hoursByCategory: input.hoursByCategory,
        marginPct: input.marginPct,
        backupPct: input.backupPct,
        projectBackupRateUsed: projectBackupRate,
        purchases: calc.purchases,
        laborHours: calc.laborHours,
        laborCost: calc.laborCost,
        backupEligibleHours: calc.backupEligibleHours,
        backupHours: calc.backupHours,
        backupCost: calc.backupCost,
        totalCost: calc.totalCost,
        sale: calc.sale,
      },
    });

    await tx.settings.update({ where: { id: settings.id }, data: { nextAmendmentNumber: settings.nextAmendmentNumber + 1 } });

    await tx.project.update({
      where: { id: projectId },
      data: {
        laborHours: projectLike.laborHours,
        laborCost: projectLike.laborCost,
        backupHours: projectLike.backupHours,
        backupHoursCost: projectLike.backupHoursCost,
        plannedPurchases: projectLike.plannedPurchases,
        sold: projectLike.sold,
      },
    });

    for (const step of projectLike.invoicePlan) {
      await tx.invoicePlanEntry.update({ where: { id: step.id }, data: { amount: step.amount } });
    }

    const invoiceEntry = await tx.invoicePlanEntry.create({
      data: {
        projectId,
        label: invoiceRequest.label,
        pct: 0,
        amount: invoiceRequest.amount,
        status: invoiceRequest.status,
        isExtra: true,
      },
    });
    await tx.amendment.update({ where: { id: amendment.id }, data: { invoiceRequestId: invoiceEntry.id } });

    for (const task of tasks) {
      await tx.projectTask.create({
        data: {
          projectId,
          amendmentId: amendment.id,
          name: `${displayId} — ${productionCategoryLabel(task.subcategory)}`,
          category: task.category,
          subcategory: task.subcategory,
          skill: task.subcategory,
          plannedHours: task.hours,
          plannedCost: task.cost,
        },
      });
    }

    return amendment;
  });

  const creator = await prisma.employee.findUnique({ where: { id: createdById }, select: { name: true } });
  return toDto(created, creator?.name ?? "?", viewerPersona);
}
