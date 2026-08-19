/**
 * GSC Pilot — Punch d'heures (18 août 2026)
 *
 * Un punch actif = TimeEntry avec endAt nul (pas de table "minuteur actif"
 * séparée — le schéma s'y prête déjà tel quel). Trois références possibles
 * (projectType) : project | service | internal — jamais un mélange, voir
 * CATEGORY_ROWS/PunchableTask pour project, TechLevel pour service.
 *
 * Coût gelé au punch (TimeEntry.costRate), selon la référence :
 * - project  → taux interne de la catégorie (BudgetModelRow.hourlyRate via
 *   PunchableTask.budgetModelRowId) — même taux que la planification
 *   budgétaire, jamais le coût personnel de l'employé (confirmé par la
 *   spécification pour les avenants : « taux internes par catégorie, pas un
 *   taux unique »).
 * - service  → TechLevel[rateType] choisi AU PUNCH parmi les classes de
 *   l'employé (Employee.techLevels, plusieurs possibles — confirmé le
 *   18 août 2026).
 * - internal → Employee.costRate (coût réel de la personne — Interne suit
 *   un coût de centre de coûts réel, pas un taux de catégorie standard).
 *
 * Approbation = Direction seulement (canApprovePunch). Une correction
 * Direction sur un punch déjà approuvé le repasse en "submitted" plutôt que
 * de modifier silencieusement un enregistrement verrouillé — l'employé, lui,
 * ne peut de toute façon plus corriger après approbation (canEditOwnPunch).
 * Aucune règle de pause dîner ni d'heures hors plage (non confirmées, voir
 * packages/business-rules/src/punch.ts).
 */
import {
  canApprovePunch,
  canEditOwnPunch,
  canPunchServiceCall,
  canPunchForOtherEmployee,
  canSeeFinancialValues,
  roundPunchMinutes,
  logPunchReassignment,
  BUDGET_CATEGORY_LABELS,
  type Persona,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { loadDelegationSettings } from "../../auth/delegation.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { Prisma, PunchableTask } from "../../generated/prisma/client.js";

const EXTRA_CATEGORY_LABELS: Record<string, string> = {
  internal: "Interne — Amélioration GSC",
  service: "Appel de service",
};

function categoryLabel(category: string): string {
  return BUDGET_CATEGORY_LABELS[category as keyof typeof BUDGET_CATEGORY_LABELS] ?? EXTRA_CATEGORY_LABELS[category] ?? category;
}

async function resolveActingEmployeeId(actorEmployeeId: string, actorPersona: Persona, requestedEmployeeId: string): Promise<string> {
  if (requestedEmployeeId === actorEmployeeId) return requestedEmployeeId;
  if (!canPunchForOtherEmployee(actorPersona)) throw new HttpError(403, "Vous ne pouvez puncher que pour vous-même.");
  return requestedEmployeeId;
}

interface PunchReferenceInput {
  projectType: string;
  projectId?: string | null;
  serviceCallId?: string | null;
  techLevelId?: string | null;
  rateType?: string | null;
}

interface ResolvedPunchTarget {
  category: string;
  costRate: number;
  techLevelId: string | null;
  rateType: string | null;
}

/** Dérive catégorie/coût gelé/classe selon la référence — même logique pour un punch minuté et une entrée manuelle. */
async function resolvePunchTarget(
  actorPersona: Persona,
  employeeId: string,
  task: PunchableTask,
  input: PunchReferenceInput,
): Promise<ResolvedPunchTarget> {
  if (input.projectType === "service") {
    if (!input.serviceCallId) throw new HttpError(400, "Un call de service est requis.");
    const call = await prisma.serviceCall.findUnique({ where: { id: input.serviceCallId } });
    if (!call) throw new HttpError(404, "Call de service introuvable.");
    if (!canPunchServiceCall(actorPersona, call, employeeId)) {
      throw new HttpError(403, "Vous ne pouvez puncher que sur un call qui vous est assigné.");
    }
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { techLevels: true } });
    if (!employee) throw new HttpError(404, "Employé introuvable.");
    const eligible = employee.techLevels.find((level) => level.id === input.techLevelId);
    if (!eligible) throw new HttpError(400, "Classe facturable non applicable à cet employé.");
    const rateType = input.rateType === "overtime" || input.rateType === "extra" ? input.rateType : "regular";
    // costRate = coût réel (Employee.costRate), cohérent avec project/internal —
    // le taux de la classe (rateForType) est le tarif FACTURÉ AU CLIENT, jamais
    // un coût; il reste dérivable via techLevelId+rateType (gelés ci-dessous)
    // pour calculer le prix de vente d'un appel de service, séparément.
    return { category: task.category, costRate: Number(employee.costRate), techLevelId: eligible.id, rateType };
  }
  if (input.projectType === "project") {
    if (!input.projectId) throw new HttpError(400, "Un projet est requis.");
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new HttpError(404, "Projet introuvable.");
    if (!task.budgetModelRowId) throw new HttpError(400, "Cette tâche n'est pas liée à une catégorie de projet.");
    const row = await prisma.budgetModelRow.findUnique({ where: { id: task.budgetModelRowId } });
    if (!row) throw new HttpError(404, "Ligne de modèle introuvable.");
    return { category: task.category, costRate: Number(row.hourlyRate), techLevelId: null, rateType: null };
  }
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new HttpError(404, "Employé introuvable.");
  return { category: task.category, costRate: Number(employee.costRate), techLevelId: null, rateType: null };
}

async function requireActiveTask(taskId: string): Promise<PunchableTask> {
  const task = await prisma.punchableTask.findUnique({ where: { id: taskId } });
  if (!task || !task.active) throw new HttpError(404, "Tâche punchable introuvable ou désactivée.");
  return task;
}

async function requirePunchRoundingMinutes(): Promise<number> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  return settings.punchRoundingMinutes;
}

type TimeEntryWithRelations = Prisma.TimeEntryGetPayload<{
  include: { employee: true; project: true; task: true; techLevel: true };
}>;
const ENTRY_INCLUDE = { employee: true, project: true, task: true, techLevel: true } as const;

export interface TimeEntryDto {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  projectType: string;
  projectId: string | null;
  projectLabel: string | null;
  serviceCallId: string | null;
  category: string;
  categoryLabel: string;
  taskId: string | null;
  taskLabel: string | null;
  startAt: string;
  endAt: string | null;
  exactMinutes: number | null;
  roundedMinutes: number | null;
  note: string | null;
  status: string;
  locked: boolean;
  techLevelId: string | null;
  techLevelLabel: string | null;
  rateType: string | null;
  blockageNote: string | null;
  costRate?: number;
}

function toDto(entry: TimeEntryWithRelations, viewerPersona: Persona): TimeEntryDto {
  const dto: TimeEntryDto = {
    id: entry.id,
    date: entry.date.toISOString().slice(0, 10),
    employeeId: entry.employeeId,
    employeeName: entry.employee.name,
    projectType: entry.projectType,
    projectId: entry.projectId,
    projectLabel: entry.project ? `${entry.project.projectNumber} — ${entry.project.name}` : null,
    serviceCallId: entry.serviceCallId,
    category: entry.category,
    categoryLabel: categoryLabel(entry.category),
    taskId: entry.taskId,
    taskLabel: entry.task?.label ?? null,
    startAt: entry.startAt.toISOString(),
    endAt: entry.endAt?.toISOString() ?? null,
    exactMinutes: entry.exactMinutes,
    roundedMinutes: entry.roundedMinutes,
    note: entry.note,
    status: entry.status,
    locked: entry.status === "approved",
    techLevelId: entry.techLevelId,
    techLevelLabel: entry.techLevel?.label ?? null,
    rateType: entry.rateType,
    blockageNote: entry.blockageNote,
  };
  if (canSeeFinancialValues(viewerPersona)) dto.costRate = Number(entry.costRate);
  return dto;
}

export interface StartTimerInput {
  employeeId: string;
  projectType: "project" | "service" | "internal";
  projectId?: string;
  serviceCallId?: string;
  taskId: string;
  note?: string;
  techLevelId?: string;
  rateType?: "regular" | "overtime" | "extra";
}

export async function startTimer(actorEmployeeId: string, actorPersona: Persona, input: StartTimerInput): Promise<TimeEntryDto> {
  const employeeId = await resolveActingEmployeeId(actorEmployeeId, actorPersona, input.employeeId);
  const running = await prisma.timeEntry.findFirst({ where: { employeeId, endAt: null } });
  if (running) throw new HttpError(409, "Un punch est déjà actif pour cet employé — arrêtez-le avant d'en débuter un autre.");

  const task = await requireActiveTask(input.taskId);
  const resolved = await resolvePunchTarget(actorPersona, employeeId, task, input);
  const today = new Date().toISOString().slice(0, 10);

  const entry = await prisma.timeEntry.create({
    data: {
      date: new Date(today),
      employeeId,
      projectType: input.projectType,
      projectId: input.projectType === "project" ? input.projectId : null,
      serviceCallId: input.projectType === "service" ? input.serviceCallId : null,
      category: resolved.category,
      taskId: task.id,
      startAt: new Date(),
      endAt: null,
      note: input.note ?? null,
      costRate: resolved.costRate,
      techLevelId: resolved.techLevelId,
      rateType: resolved.rateType,
    },
    include: ENTRY_INCLUDE,
  });
  return toDto(entry, actorPersona);
}

export async function stopTimer(actorEmployeeId: string, actorPersona: Persona, entryId: string): Promise<TimeEntryDto> {
  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new HttpError(404, "Punch introuvable.");
  if (entry.endAt) throw new HttpError(409, "Ce punch est déjà arrêté.");
  if (entry.employeeId !== actorEmployeeId && !canPunchForOtherEmployee(actorPersona)) {
    throw new HttpError(403, "Vous ne pouvez arrêter que votre propre punch.");
  }
  const roundingMinutes = await requirePunchRoundingMinutes();
  const endAt = new Date();
  const exactMinutes = Math.max(0, Math.round((endAt.getTime() - entry.startAt.getTime()) / 60000));
  const roundedMinutes = roundPunchMinutes(exactMinutes, roundingMinutes);

  const updated = await prisma.timeEntry.update({
    where: { id: entryId },
    data: { endAt, exactMinutes, roundedMinutes },
    include: ENTRY_INCLUDE,
  });
  return toDto(updated, actorPersona);
}

export interface ManualEntryInput {
  employeeId: string;
  date: string;
  projectType: "project" | "service" | "internal";
  projectId?: string;
  serviceCallId?: string;
  taskId: string;
  hours: number;
  note?: string;
  techLevelId?: string;
  rateType?: "regular" | "overtime" | "extra";
  blockageNote?: string;
}

export async function createManualEntry(actorEmployeeId: string, actorPersona: Persona, input: ManualEntryInput): Promise<TimeEntryDto> {
  const employeeId = await resolveActingEmployeeId(actorEmployeeId, actorPersona, input.employeeId);
  if (!(input.hours > 0)) throw new HttpError(400, "Le nombre d'heures doit être positif.");

  const task = await requireActiveTask(input.taskId);
  const resolved = await resolvePunchTarget(actorPersona, employeeId, task, input);
  const roundingMinutes = await requirePunchRoundingMinutes();
  const exactMinutes = Math.round(input.hours * 60);
  const roundedMinutes = roundPunchMinutes(exactMinutes, roundingMinutes);
  // Entrée manuelle = travail déjà terminé, saisi après coup — startAt/endAt
  // n'ont aucun sens en heure d'horloge réelle ici (contrairement au
  // minuteur), seule la date + la durée comptent.
  const at = new Date(`${input.date}T12:00:00.000Z`);

  const entry = await prisma.timeEntry.create({
    data: {
      date: new Date(input.date),
      employeeId,
      projectType: input.projectType,
      projectId: input.projectType === "project" ? input.projectId : null,
      serviceCallId: input.projectType === "service" ? input.serviceCallId : null,
      category: resolved.category,
      taskId: task.id,
      startAt: at,
      endAt: at,
      exactMinutes,
      roundedMinutes,
      note: input.note ?? null,
      blockageNote: input.blockageNote ?? null,
      costRate: resolved.costRate,
      techLevelId: resolved.techLevelId,
      rateType: resolved.rateType,
    },
    include: ENTRY_INCLUDE,
  });
  return toDto(entry, actorPersona);
}

export async function listMyTimeEntries(employeeId: string, viewerPersona: Persona): Promise<TimeEntryDto[]> {
  const entries = await prisma.timeEntry.findMany({ where: { employeeId }, include: ENTRY_INCLUDE, orderBy: { startAt: "desc" } });
  return entries.map((entry) => toDto(entry, viewerPersona));
}

/** File d'approbation — jamais un punch encore actif (endAt nul), voir approveTimeEntry. */
export async function listTimeEntriesForApproval(viewerPersona: Persona): Promise<TimeEntryDto[]> {
  const entries = await prisma.timeEntry.findMany({
    where: { status: "submitted", endAt: { not: null } },
    include: ENTRY_INCLUDE,
    orderBy: { startAt: "asc" },
  });
  return entries.map((entry) => toDto(entry, viewerPersona));
}

/** Vue Direction — toutes les entrées, la plus récente d'abord. */
export async function listAllTimeEntries(viewerPersona: Persona): Promise<TimeEntryDto[]> {
  const entries = await prisma.timeEntry.findMany({ include: ENTRY_INCLUDE, orderBy: { startAt: "desc" } });
  return entries.map((entry) => toDto(entry, viewerPersona));
}

export async function approveTimeEntry(entryId: string, actorPersona: Persona): Promise<TimeEntryDto> {
  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new HttpError(404, "Punch introuvable.");
  if (!entry.endAt) throw new HttpError(409, "Ce punch est encore actif — impossible de l'approuver avant qu'il soit arrêté.");
  if (entry.status === "approved") throw new HttpError(409, "Ce punch est déjà approuvé.");

  const updated = await prisma.timeEntry.update({ where: { id: entryId }, data: { status: "approved" }, include: ENTRY_INCLUDE });
  return toDto(updated, actorPersona);
}

function referenceLabel(entry: { projectType: string; projectId: string | null; serviceCallId: string | null }): string {
  if (entry.projectType === "project") return `project:${entry.projectId}`;
  if (entry.projectType === "service") return `service:${entry.serviceCallId}`;
  return "internal";
}

export interface UpdateTimeEntryInput {
  note?: string;
  blockageNote?: string | null;
  projectType?: "project" | "service" | "internal";
  projectId?: string;
  serviceCallId?: string;
  taskId?: string;
  hours?: number;
  justification?: string;
}

/**
 * Correction avant approbation (l'employé, canEditOwnPunch) OU par Direction
 * à tout moment (canApprovePunch) — dans ce dernier cas, un punch déjà
 * approuvé repasse en "submitted" plutôt que d'être modifié en silence.
 * Un changement de référence (projet/call/interne) est journalisé
 * (logPunchReassignment, jamais réimplémenté ici).
 */
export async function updateTimeEntry(
  entryId: string,
  actorEmployeeId: string,
  actorPersona: Persona,
  patch: UpdateTimeEntryInput,
): Promise<TimeEntryDto> {
  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new HttpError(404, "Punch introuvable.");

  const settings = await loadDelegationSettings();
  const isOwnerEdit = canEditOwnPunch(actorPersona, { employee: entry.employeeId, status: entry.status }, actorEmployeeId);
  const isDirectionEdit = canApprovePunch(settings, actorPersona);
  if (!isOwnerEdit && !isDirectionEdit) throw new HttpError(403, "Vous ne pouvez pas modifier ce punch.");
  if (!entry.endAt) throw new HttpError(409, "Ce punch est encore actif — arrêtez-le avant de le corriger.");

  const referenceChanged =
    (patch.projectType !== undefined && patch.projectType !== entry.projectType) ||
    (patch.projectId !== undefined && patch.projectId !== entry.projectId) ||
    (patch.serviceCallId !== undefined && patch.serviceCallId !== entry.serviceCallId);

  const data: Prisma.TimeEntryUncheckedUpdateInput = {};
  if (patch.note !== undefined) data.note = patch.note;
  if (patch.blockageNote !== undefined) data.blockageNote = patch.blockageNote;

  if (referenceChanged || patch.taskId) {
    const task = patch.taskId ? await requireActiveTask(patch.taskId) : await requireActiveTask(entry.taskId!);
    const nextProjectType = patch.projectType ?? entry.projectType;
    const resolved = await resolvePunchTarget(actorPersona, entry.employeeId, task, {
      projectType: nextProjectType,
      projectId: patch.projectId ?? entry.projectId,
      serviceCallId: patch.serviceCallId ?? entry.serviceCallId,
      techLevelId: entry.techLevelId,
      rateType: entry.rateType,
    });
    data.projectType = nextProjectType;
    data.projectId = nextProjectType === "project" ? patch.projectId ?? entry.projectId : null;
    data.serviceCallId = nextProjectType === "service" ? patch.serviceCallId ?? entry.serviceCallId : null;
    data.category = resolved.category;
    data.taskId = task.id;
    data.costRate = resolved.costRate;
    data.techLevelId = resolved.techLevelId;
    data.rateType = resolved.rateType;
  }

  if (patch.hours !== undefined) {
    if (!(patch.hours > 0)) throw new HttpError(400, "Le nombre d'heures doit être positif.");
    const roundingMinutes = await requirePunchRoundingMinutes();
    const exactMinutes = Math.round(patch.hours * 60);
    data.exactMinutes = exactMinutes;
    data.roundedMinutes = roundPunchMinutes(exactMinutes, roundingMinutes);
  }

  if (entry.status === "approved") data.status = "submitted";

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.timeEntry.update({ where: { id: entryId }, data, include: ENTRY_INCLUDE });
    if (referenceChanged) {
      const logEntry = logPunchReassignment([], {
        entryId,
        fromReference: referenceLabel(entry),
        toReference: referenceLabel(saved),
        reassignedBy: actorEmployeeId,
        justification: patch.justification,
      });
      await tx.auditLogEntry.create({
        data: {
          actorId: actorEmployeeId,
          actorPersona,
          action: logEntry.type,
          entityType: "TimeEntry",
          entityId: logEntry.entryId,
          meta: { fromReference: logEntry.fromReference, toReference: logEntry.toReference },
          justification: logEntry.justification || null,
        },
      });
    }
    return saved;
  });

  return toDto(updated, actorPersona);
}

export interface PunchableTaskDto {
  id: string;
  category: string;
  categoryLabel: string;
  label: string;
  scope: "project" | "internal" | "service";
}

export async function listPunchableTasks(): Promise<PunchableTaskDto[]> {
  const rows = await prisma.punchableTask.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    label: row.label,
    scope: row.budgetModelRowId ? "project" : row.category === "service" ? "service" : "internal",
  }));
}

export interface ProjectOptionDto {
  id: string;
  label: string;
}

export async function listProjectOptions(): Promise<ProjectOptionDto[]> {
  const rows = await prisma.project.findMany({
    where: { archivedAt: null, deletedAt: null },
    select: { id: true, projectNumber: true, name: true },
    orderBy: { projectNumber: "asc" },
  });
  return rows.map((row) => ({ id: row.id, label: `${row.projectNumber} — ${row.name}` }));
}

export interface PunchableEmployeeDto {
  id: string;
  name: string;
  techLevelIds: string[];
}

/**
 * Liste allégée (jamais costRate ni autre champ sensible) — pour le
 * sélecteur d'employé quand Direction/Administration/Propriétaire punchent
 * pour quelqu'un d'autre (canPunchForOtherEmployee). Volontairement séparée
 * de GET /api/employees (canAccessSettings, Direction seulement) : ce
 * dernier reste réservé aux Paramètres, jamais élargi pour ce besoin.
 */
export async function listPunchableEmployees(): Promise<PunchableEmployeeDto[]> {
  const employees = await prisma.employee.findMany({
    where: { active: true },
    include: { techLevels: true },
    orderBy: { name: "asc" },
  });
  return employees.map((employee) => ({
    id: employee.id,
    name: employee.name,
    techLevelIds: employee.techLevels.map((techLevel) => techLevel.id),
  }));
}

export interface ServiceCallOptionDto {
  id: string;
  label: string;
}

/** Vide tant que le module Appels de service n'est pas construit — voir CLAUDE.md, ordre des modules. */
export async function listServiceCallOptions(employeeId: string, persona: Persona): Promise<ServiceCallOptionDto[]> {
  const rows = await prisma.serviceCall.findMany({
    where: persona === "member" ? { assignedEmployeeId: employeeId } : {},
    select: { id: true, displayId: true, request: true },
  });
  return rows.map((row) => ({ id: row.id, label: `${row.displayId} — ${row.request}` }));
}
