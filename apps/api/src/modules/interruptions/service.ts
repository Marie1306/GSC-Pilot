/**
 * GSC Pilot — Interruptions de capacité (31 août 2026)
 *
 * Mécanisme "Ajouter une interruption" déjà prévu (spec confirmée), jamais
 * construit avant cette phase : réduit la capacité disponible d'un employé
 * précis (employeeId renseigné) ou de tout l'atelier (employeeId nul, ex.
 * jour férié) pour une journée précise, en heures partielles — jamais un
 * maximum arbitraire côté client, toujours validé contre la vraie capacité
 * de CE jour (validateInterruptionHours, gantt-schedule.ts, semaine
 * québécoise). Aucune règle stockée : le Gantt (gantt/service.ts,
 * computeProductionSchedule) relit ces lignes à chaque calcul, jamais un
 * recalcul stocké — voir en-tête de gantt-schedule.ts.
 */
import { INTERRUPTION_REASONS, validateInterruptionHours, type InterruptionReason } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { Interruption } from "../../generated/prisma/client.js";

export interface InterruptionInput {
  employeeId?: string | null;
  date: string; // YYYY-MM-DD
  hours: number;
  reason: InterruptionReason;
  reference?: string;
}

export interface InterruptionDto {
  id: string;
  employeeId: string | null;
  employeeName: string | null; // nul = tout l'atelier
  date: string;
  hours: number;
  reason: InterruptionReason;
  reference: string | null;
  createdByName: string;
  createdAt: string;
}

async function toDtos(rows: Interruption[]): Promise<InterruptionDto[]> {
  const employeeIds = [...new Set(rows.flatMap((row) => [row.employeeId, row.createdById]).filter((v): v is string => !!v))];
  const employees = employeeIds.length ? await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(employees.map((employee) => [employee.id, employee.name]));
  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeId ? (nameById.get(row.employeeId) ?? "?") : null,
    date: row.date.toISOString().slice(0, 10),
    hours: Number(row.hours),
    reason: row.reason as InterruptionReason,
    reference: row.reference,
    createdByName: nameById.get(row.createdById) ?? "?",
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listInterruptions(): Promise<InterruptionDto[]> {
  const rows = await prisma.interruption.findMany({ orderBy: { date: "desc" } });
  return toDtos(rows);
}

/** Toujours midi, jamais minuit — même précaution que gantt-schedule.ts (atNoon) pour éviter tout décalage de fuseau/heure d'été. */
function parseDateOnly(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

async function assertValidInterruptionInput(input: InterruptionInput): Promise<Date> {
  if (!INTERRUPTION_REASONS.includes(input.reason)) throw new HttpError(400, "Motif d'interruption invalide.");
  if (input.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee || !employee.active) throw new HttpError(400, "Employé introuvable ou inactif.");
  }
  const date = parseDateOnly(input.date);
  try {
    validateInterruptionHours(date, input.hours);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Erreur de validation.");
  }
  return date;
}

export async function createInterruption(input: InterruptionInput, createdById: string): Promise<InterruptionDto> {
  const date = await assertValidInterruptionInput(input);
  const row = await prisma.interruption.create({
    data: {
      employeeId: input.employeeId || null,
      date,
      hours: input.hours,
      reason: input.reason,
      reference: input.reference?.trim() || null,
      createdById,
    },
  });
  return (await toDtos([row]))[0]!;
}

export async function updateInterruption(id: string, input: InterruptionInput): Promise<InterruptionDto> {
  const existing = await prisma.interruption.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Interruption introuvable.");
  const date = await assertValidInterruptionInput(input);
  const row = await prisma.interruption.update({
    where: { id },
    data: {
      employeeId: input.employeeId || null,
      date,
      hours: input.hours,
      reason: input.reason,
      reference: input.reference?.trim() || null,
    },
  });
  return (await toDtos([row]))[0]!;
}

export async function deleteInterruption(id: string): Promise<void> {
  const existing = await prisma.interruption.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Interruption introuvable.");
  await prisma.interruption.delete({ where: { id } });
}
