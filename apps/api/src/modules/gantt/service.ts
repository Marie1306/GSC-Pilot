/**
 * GSC Pilot — Gantt de production (21 août 2026, phase A ; moteur automatique 31 août 2026)
 *
 * Adaptateur Prisma pour gantt-schedule.ts (packages/business-rules) — AUCUNE
 * règle de planification ici, seulement l'assemblage des données réelles
 * (tâches éligibles, employés, interruptions) et leur DTO de sortie. Le
 * calendrier est toujours recalculé au complet à la lecture (jamais une date
 * stockée), voir l'en-tête de gantt-schedule.ts.
 *
 * Éligibilité d'une ProjectTask (lue à chaque calcul, jamais un rattrapage
 * écrit) : `enteredGanttAt` renseigné (entrée par lot précis, ou toujours
 * renseigné pour une tâche de Roulement, voir activateRollingGantt) OU le
 * projet a `ganttAutoEnter = true` (tout le projet, maintenant et pour
 * l'avenir). Une tâche `ganttCompleted` est exclue du calcul (jamais
 * replanifiée) — une dépendance qui pointe vers une tâche exclue (complétée
 * OU pas encore entrée) est traitée comme déjà satisfaite par le moteur pur
 * (référence hors du tableau `tasks` fourni, voir runGanttSchedule) : c'est
 * le comportement voulu pour une tâche complétée, et un compromis accepté
 * pour une dépendance pas encore entrée (cas marginal — l'ordre naturel
 * d'entrée par lot suit déjà l'ordre de création des dépendances) plutôt que
 * d'ajouter une validation de plus, jamais demandée, contre un cas qui ne
 * devrait pas se produire en pratique.
 */
import {
  runGanttSchedule,
  rollingGanttTasks,
  toDateKey,
  productionCategoryLabel,
  ROLLING_PRIORITY_BONUS,
  type GanttEmployee,
  type GanttInterruption,
  type GanttOwnerType,
  type GanttTaskInput,
  type GanttScheduleResult,
  type GanttScheduledTask,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Project.deadline/Rolling.dueDate/ProjectTask.desiredStart sont des dates-
 * calendrier écrites via le patron déjà établi du reste du code (ex.
 * updateProjectInfo) : `new Date("YYYY-MM-DD")`, donc minuit UTC — jamais
 * toDateKey() (business-rules), qui lit via des getters LOCAUX et décalerait
 * d'un jour si le serveur tourne dans un fuseau autre qu'UTC. `.toISOString()`
 * récupère exactement la date saisie, quel que soit le fuseau du serveur —
 * même patron que TimeEntry.date ailleurs dans l'API. Seul Interruption.date
 * (écrit à midi LOCAL par interruptions/service.ts, même précaution que
 * atNoon()) utilise toDateKey() directement, en toute cohérence.
 */
function toCalendarDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Assemblage des tâches éligibles (adaptateur — voir en-tête de fichier)
// ---------------------------------------------------------------------------

interface TaskMeta {
  id: string;
  ownerType: GanttOwnerType;
  ownerId: string;
  ownerLabel: string;
  name: string;
  category: string;
  subcategory: string | null;
}

const eligibleTaskInclude = {
  dependsOn: { select: { dependsOnId: true } as const },
  project: { select: { id: true, projectNumber: true, name: true, priority: true, deadline: true } as const },
  rolling: { select: { id: true, rollingNumber: true, priority: true, dueDate: true } as const },
} as const;

type EligibleTaskRow = {
  id: string;
  projectId: string | null;
  rollingId: string | null;
  name: string;
  category: string;
  subcategory: string | null;
  skill: string | null;
  plannedHours: unknown;
  desiredStart: Date | null;
  assignedEmployeeId: string | null;
  dependsOn: { dependsOnId: string }[];
  project: { id: string; projectNumber: string; name: string; priority: number; deadline: Date | null } | null;
  rolling: { id: string; rollingNumber: string; priority: number; dueDate: Date | null } | null;
};

function toTaskInputAndMeta(task: EligibleTaskRow): { input: GanttTaskInput; meta: TaskMeta } {
  const isRolling = !!task.rollingId;
  const priority = isRolling ? task.rolling!.priority + ROLLING_PRIORITY_BONUS : (task.project?.priority ?? 0);
  const deadlineDate = isRolling ? task.rolling!.dueDate : (task.project?.deadline ?? null);
  const ownerLabel = isRolling ? task.rolling!.rollingNumber : `${task.project!.projectNumber} — ${task.project!.name}`;
  return {
    input: {
      id: task.id,
      ownerType: isRolling ? "rolling" : "project",
      ownerId: isRolling ? task.rollingId! : task.projectId!,
      skill: task.skill,
      plannedHours: Number(task.plannedHours),
      desiredStart: task.desiredStart ? toCalendarDateKey(task.desiredStart) : null,
      dependsOnIds: task.dependsOn.map((d) => d.dependsOnId),
      pinnedEmployeeId: task.assignedEmployeeId,
      priority,
      deadline: deadlineDate ? toCalendarDateKey(deadlineDate) : null,
    },
    meta: {
      id: task.id,
      ownerType: isRolling ? "rolling" : "project",
      ownerId: isRolling ? task.rollingId! : task.projectId!,
      ownerLabel,
      name: task.name,
      category: task.category,
      subcategory: task.subcategory,
    },
  };
}

/** Même règle d'éligibilité (voir en-tête de fichier), paramétrée par ganttCompleted — réutilisée pour les tâches à planifier ET pour la petite liste "Tâches complétées" (gatherCompletedTasks, pour permettre de rouvrir). */
function eligibilityWhere(ganttCompleted: boolean) {
  return {
    ganttCompleted,
    AND: [
      { OR: [{ enteredGanttAt: { not: null } }, { project: { ganttAutoEnter: true } }] },
      { OR: [{ projectId: null }, { project: { deletedAt: null, closedAt: null } }] },
      { OR: [{ rollingId: null }, { rolling: { deletedAt: null, archivedAt: null } }] },
    ],
  };
}

/** Tâches éligibles au calcul — voir en-tête de fichier pour la règle d'éligibilité. */
async function gatherEligibleTasks(): Promise<{ inputs: GanttTaskInput[]; metaById: Map<string, TaskMeta> }> {
  const rows = (await prisma.projectTask.findMany({ where: eligibilityWhere(false), include: eligibleTaskInclude })) as EligibleTaskRow[];

  const inputs: GanttTaskInput[] = [];
  const metaById = new Map<string, TaskMeta>();
  for (const row of rows) {
    const { input, meta } = toTaskInputAndMeta(row);
    inputs.push(input);
    metaById.set(input.id, meta);
  }
  return { inputs, metaById };
}

/**
 * Tâches complétées mais toujours éligibles (même règle) — exclues du
 * calcul de calendrier (runGanttSchedule) mais affichées à part pour
 * permettre le geste "Rouvrir" (setProductionTaskCompleted), inchangé
 * depuis la phase A. Aucune date prédite ici (n'a jamais de sens pour une
 * tâche déjà complétée) — remainingHours à 0, allocations vides.
 */
async function gatherCompletedTasks(nameById: Map<string, string>): Promise<GanttScheduledTaskDto[]> {
  const rows = (await prisma.projectTask.findMany({ where: eligibilityWhere(true), include: eligibleTaskInclude })) as EligibleTaskRow[];
  return rows.map((row) => {
    const { input, meta } = toTaskInputAndMeta(row);
    const fakeScheduled: GanttScheduledTask = { ...input, allocations: [], firstScheduledDate: null, predictedCompletedDate: null, remainingHours: 0 };
    return toScheduledTaskDto(fakeScheduled, meta, nameById);
  });
}

async function gatherGanttEmployees(): Promise<{ employees: GanttEmployee[]; nameById: Map<string, string> }> {
  const rows = await prisma.employee.findMany({
    where: { active: true },
    select: { id: true, name: true, skills: true, skillEfficiencies: true },
  });
  return {
    employees: rows.map((row) => ({
      id: row.id,
      skills: row.skills,
      skillEfficiencies: (row.skillEfficiencies as Record<string, number> | null) ?? {},
    })),
    nameById: new Map(rows.map((row) => [row.id, row.name])),
  };
}

/** Seulement à partir d'aujourd'hui — une interruption passée ne peut plus influencer un recalcul tourné vers l'horizon futur. */
async function gatherGanttInterruptions(): Promise<GanttInterruption[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const rows = await prisma.interruption.findMany({
    where: { date: { gte: startOfToday } },
    select: { employeeId: true, date: true, hours: true },
  });
  return rows.map((row) => ({ employeeId: row.employeeId, date: toDateKey(row.date), hours: Number(row.hours) }));
}

// ---------------------------------------------------------------------------
// DTO de sortie
// ---------------------------------------------------------------------------

export interface GanttScheduledTaskDto {
  id: string;
  ownerType: GanttOwnerType;
  ownerId: string;
  ownerLabel: string;
  name: string;
  category: string;
  categoryLabel: string;
  subcategory: string | null;
  skill: string | null;
  plannedHours: number;
  remainingHours: number;
  pinnedEmployeeId: string | null;
  pinnedEmployeeName: string | null;
  priority: number;
  deadline: string | null;
  desiredStart: string | null;
  dependsOnIds: string[];
  allocations: { date: string; employeeId: string; employeeName: string; rawHours: number; effectiveHours: number }[];
  firstScheduledDate: string | null;
  predictedCompletedDate: string | null;
}

export interface GanttScheduleDto {
  horizonDays: string[];
  tasks: GanttScheduledTaskDto[];
  unscheduled: GanttScheduledTaskDto[];
  /** Complétées (ganttCompleted) — hors calcul, affichées à part pour le geste "Rouvrir" (voir gatherCompletedTasks). */
  completed: GanttScheduledTaskDto[];
  capacityByEmployeeDate: Record<string, Record<string, { base: number; available: number; employeeName: string }>>;
  employees: { id: string; name: string }[];
}

function toScheduledTaskDto(task: GanttScheduledTask, meta: TaskMeta | undefined, nameById: Map<string, string>): GanttScheduledTaskDto {
  return {
    id: task.id,
    ownerType: task.ownerType,
    ownerId: task.ownerId,
    ownerLabel: meta?.ownerLabel ?? "?",
    name: meta?.name ?? "?",
    category: meta?.category ?? "",
    categoryLabel: productionCategoryLabel(meta?.category ?? ""),
    subcategory: meta?.subcategory ?? null,
    skill: task.skill,
    plannedHours: task.plannedHours,
    remainingHours: round2(task.remainingHours),
    pinnedEmployeeId: task.pinnedEmployeeId,
    pinnedEmployeeName: task.pinnedEmployeeId ? (nameById.get(task.pinnedEmployeeId) ?? "?") : null,
    priority: task.priority,
    deadline: task.deadline,
    desiredStart: task.desiredStart,
    dependsOnIds: task.dependsOnIds,
    allocations: task.allocations.map((a) => ({ ...a, employeeName: nameById.get(a.employeeId) ?? "?" })),
    firstScheduledDate: task.firstScheduledDate,
    predictedCompletedDate: task.predictedCompletedDate,
  };
}

function toScheduleDto(result: GanttScheduleResult, metaById: Map<string, TaskMeta>, nameById: Map<string, string>, completed: GanttScheduledTaskDto[]): GanttScheduleDto {
  const capacityByEmployeeDate: GanttScheduleDto["capacityByEmployeeDate"] = {};
  for (const [date, byEmployee] of Object.entries(result.capacityByEmployeeDate)) {
    capacityByEmployeeDate[date] = {};
    for (const [employeeId, info] of Object.entries(byEmployee)) {
      capacityByEmployeeDate[date][employeeId] = { ...info, employeeName: nameById.get(employeeId) ?? "?" };
    }
  }
  return {
    horizonDays: result.horizonDays,
    tasks: result.tasks.map((task) => toScheduledTaskDto(task, metaById.get(task.id), nameById)),
    unscheduled: result.unscheduled.map((task) => toScheduledTaskDto(task, metaById.get(task.id), nameById)),
    completed,
    capacityByEmployeeDate,
    employees: [...nameById.entries()].map(([id, name]) => ({ id, name })),
  };
}

/** Calendrier complet — toutes les tâches déjà entrées au Gantt (Projets et Roulements confondus). */
export async function computeProductionSchedule(): Promise<GanttScheduleDto> {
  const [{ inputs, metaById }, { employees, nameById }, interruptions] = await Promise.all([
    gatherEligibleTasks(),
    gatherGanttEmployees(),
    gatherGanttInterruptions(),
  ]);
  const result = runGanttSchedule({ tasks: inputs, employees, interruptions });
  const completed = await gatherCompletedTasks(nameById);
  return toScheduleDto(result, metaById, nameById, completed);
}

// ---------------------------------------------------------------------------
// File d'attente "prêt mais pas encore entré"
// ---------------------------------------------------------------------------

export interface GanttReadyRollingDto {
  ownerType: "rolling";
  id: string;
  rollingNumber: string;
  contactName: string;
  priority: number;
  dueDate: string | null;
}

export interface GanttReadyProjectBatchDto {
  ownerType: "project_batch";
  id: string; // subassemblyId ou amendmentId — sert de batchId pour enterProjectGanttBatch
  batchKind: "subassembly" | "amendment";
  projectId: string;
  projectNumber: string;
  projectName: string;
  projectPriority: number;
  batchLabel: string;
  taskCount: number;
  totalPlannedHours: number;
}

export interface GanttReadyQueueDto {
  rollings: GanttReadyRollingDto[];
  projectBatches: GanttReadyProjectBatchDto[];
}

export async function listGanttReadyQueue(): Promise<GanttReadyQueueDto> {
  const [rollings, pendingTasks] = await Promise.all([
    prisma.rolling.findMany({
      where: { enteredGanttAt: null, deletedAt: null, archivedAt: null, status: "active" },
      include: { contact: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.projectTask.findMany({
      where: {
        enteredGanttAt: null,
        project: { ganttAutoEnter: false, deletedAt: null, closedAt: null },
        OR: [{ subassemblyId: { not: null } }, { amendmentId: { not: null } }],
      },
      include: {
        project: { select: { id: true, projectNumber: true, name: true, priority: true } },
        subassembly: { select: { number: true } },
        amendment: { select: { displayId: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const batchByKey = new Map<string, GanttReadyProjectBatchDto>();
  for (const task of pendingTasks) {
    const batchKind: "subassembly" | "amendment" = task.subassemblyId ? "subassembly" : "amendment";
    const batchId = (task.subassemblyId ?? task.amendmentId)!;
    const key = `${batchKind}:${batchId}`;
    const existing = batchByKey.get(key);
    if (existing) {
      existing.taskCount += 1;
      existing.totalPlannedHours = round2(existing.totalPlannedHours + Number(task.plannedHours));
    } else {
      batchByKey.set(key, {
        ownerType: "project_batch",
        id: batchId,
        batchKind,
        projectId: task.project!.id,
        projectNumber: task.project!.projectNumber,
        projectName: task.project!.name,
        projectPriority: task.project!.priority,
        batchLabel: batchKind === "subassembly" ? task.subassembly!.number : task.amendment!.displayId,
        taskCount: 1,
        totalPlannedHours: Number(task.plannedHours),
      });
    }
  }

  return {
    rollings: rollings.map((rolling) => ({
      ownerType: "rolling",
      id: rolling.id,
      rollingNumber: rolling.rollingNumber,
      contactName: rolling.contact.name,
      priority: rolling.priority,
      dueDate: rolling.dueDate ? toCalendarDateKey(rolling.dueDate) : null,
    })),
    projectBatches: [...batchByKey.values()],
  };
}

// ---------------------------------------------------------------------------
// Aperçu avant entrée (fenêtre contextuelle)
// ---------------------------------------------------------------------------

export interface GanttPreviewInput {
  ownerType: GanttOwnerType;
  ownerId: string;
  /** Projet seulement : lot précis (subassemblyId ou amendmentId, voir listGanttReadyQueue). */
  batchId?: string;
  /** Roulement seulement : les tâches n'existent pas encore avant activation — mêmes heures que le popup d'activation (activateRollingGantt). */
  hoursByCategory?: Record<string, number>;
  /** Aperçu à une priorité différente de la valeur actuellement enregistrée — optionnel, sinon la priorité actuelle du Projet/Roulement est utilisée. */
  priority?: number;
}

export interface GanttPreviewDto {
  schedule: GanttScheduleDto;
  candidateTaskIds: string[];
}

export async function previewGanttEntry(input: GanttPreviewInput): Promise<GanttPreviewDto> {
  const { inputs: eligible, metaById } = await gatherEligibleTasks();

  const candidates: { input: GanttTaskInput; meta: TaskMeta }[] = [];
  if (input.ownerType === "rolling") {
    const rolling = await prisma.rolling.findUnique({ where: { id: input.ownerId } });
    if (!rolling) throw new HttpError(404, "Roulement introuvable.");
    if (rolling.enteredGanttAt) throw new HttpError(400, "Ce roulement est déjà activé au Gantt.");
    const priority = (input.priority ?? rolling.priority) + ROLLING_PRIORITY_BONUS;
    const deadline = rolling.dueDate ? toCalendarDateKey(rolling.dueDate) : null;
    for (const task of rollingGanttTasks(rolling.id, input.hoursByCategory ?? {})) {
      candidates.push({
        input: {
          id: task.id,
          ownerType: "rolling",
          ownerId: rolling.id,
          skill: task.category,
          plannedHours: task.hours,
          desiredStart: null,
          dependsOnIds: [],
          pinnedEmployeeId: null,
          priority,
          deadline,
        },
        meta: {
          id: task.id,
          ownerType: "rolling",
          ownerId: rolling.id,
          ownerLabel: rolling.rollingNumber,
          name: `${rolling.rollingNumber} — ${productionCategoryLabel(task.category)}`,
          category: task.category,
          subcategory: null,
        },
      });
    }
  } else {
    if (!input.batchId) throw new HttpError(400, "Le lot est requis pour un aperçu de projet.");
    const project = await prisma.project.findUnique({ where: { id: input.ownerId } });
    if (!project) throw new HttpError(404, "Projet introuvable.");
    const rows = await prisma.projectTask.findMany({
      where: { projectId: input.ownerId, enteredGanttAt: null, OR: [{ subassemblyId: input.batchId }, { amendmentId: input.batchId }] },
      include: { dependsOn: { select: { dependsOnId: true } } },
    });
    if (rows.length === 0) throw new HttpError(400, "Aucune tâche à prévisualiser pour ce lot.");
    const priority = input.priority ?? project.priority;
    const deadline = project.deadline ? toCalendarDateKey(project.deadline) : null;
    for (const row of rows) {
      candidates.push({
        input: {
          id: row.id,
          ownerType: "project",
          ownerId: project.id,
          skill: row.skill,
          plannedHours: Number(row.plannedHours),
          desiredStart: row.desiredStart ? toCalendarDateKey(row.desiredStart) : null,
          dependsOnIds: row.dependsOn.map((d) => d.dependsOnId),
          pinnedEmployeeId: row.assignedEmployeeId,
          priority,
          deadline,
        },
        meta: {
          id: row.id,
          ownerType: "project",
          ownerId: project.id,
          ownerLabel: `${project.projectNumber} — ${project.name}`,
          name: row.name,
          category: row.category,
          subcategory: row.subcategory,
        },
      });
    }
  }

  const { employees, nameById } = await gatherGanttEmployees();
  const interruptions = await gatherGanttInterruptions();
  const mergedMeta = new Map(metaById);
  for (const candidate of candidates) mergedMeta.set(candidate.meta.id, candidate.meta);

  const result = runGanttSchedule({ tasks: [...eligible, ...candidates.map((c) => c.input)], employees, interruptions });
  return { schedule: toScheduleDto(result, mergedMeta, nameById, []), candidateTaskIds: candidates.map((c) => c.meta.id) };
}

// ---------------------------------------------------------------------------
// Gestes d'entrée au Gantt
// ---------------------------------------------------------------------------

export interface EnterProjectGanttInput {
  scope: "batch" | "whole_project";
  batchId?: string;
}

/**
 * Geste explicite de Direction (fenêtre contextuelle, spec confirmée) — ne
 * touche JAMAIS subassemblies/service.ts ni amendments/service.ts : "batch"
 * tamponne les ProjectTask déjà créées pour ce lot précis,
 * "whole_project" pose seulement Project.ganttAutoEnter (éligibilité lue à
 * chaque calcul, voir gatherEligibleTasks).
 */
export async function enterProjectGanttBatch(projectId: string, enteredById: string, input: EnterProjectGanttInput): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  if (project.ganttAutoEnter) throw new HttpError(400, "Ce projet est déjà entré au Gantt en entier.");

  if (input.scope === "whole_project") {
    await prisma.project.update({ where: { id: projectId }, data: { ganttAutoEnter: true } });
    return;
  }

  if (!input.batchId) throw new HttpError(400, "Le lot (assemblage ou avenant) est requis.");
  const tasks = await prisma.projectTask.findMany({
    where: { projectId, enteredGanttAt: null, OR: [{ subassemblyId: input.batchId }, { amendmentId: input.batchId }] },
    select: { id: true },
  });
  if (tasks.length === 0) throw new HttpError(400, "Aucune tâche à entrer pour ce lot.");
  await prisma.projectTask.updateMany({
    where: { id: { in: tasks.map((t) => t.id) } },
    data: { enteredGanttAt: new Date(), enteredGanttById: enteredById },
  });
}

/**
 * Un Roulement entre TOUJOURS en entier (jamais incrémentalement) — les
 * ProjectTask n'existent pas avant ce geste (contrairement à un Projet, dont
 * les tâches sont déjà créées par subassemblies/amendments avant l'entrée au
 * Gantt), même mécanisme de création que createSubassemblyTasks
 * (subassemblies/service.ts) : une tâche par catégorie fournie, sans
 * dépendances (rollingGanttTasks, gantt-schedule.ts). enteredGanttAt est posé
 * à la fois sur Rolling ET sur chaque ProjectTask créée (voir schema.prisma,
 * commentaire de ProjectTask.enteredGanttAt) — l'éligibilité au calcul ne lit
 * que le second (gatherEligibleTasks), le premier ne sert qu'à
 * listGanttReadyQueue et à l'affichage du menu Options du roulement.
 */
export async function activateRollingGantt(rollingId: string, enteredById: string, hoursByCategory: Record<string, number>): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  if (rolling.enteredGanttAt) throw new HttpError(400, "Ce roulement est déjà activé au Gantt.");

  const tasks = rollingGanttTasks(rollingId, hoursByCategory);
  if (tasks.length === 0) throw new HttpError(400, "Au moins une catégorie d'heures est requise.");

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.rolling.update({ where: { id: rollingId }, data: { enteredGanttAt: now, enteredGanttById: enteredById } });
    for (const task of tasks) {
      await tx.projectTask.create({
        data: {
          rollingId,
          name: `${rolling.rollingNumber} — ${productionCategoryLabel(task.category)}`,
          category: task.category,
          skill: task.category,
          plannedHours: task.hours,
          enteredGanttAt: now,
          enteredGanttById: enteredById,
        },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Affectation manuelle / complétion (21 août 2026, inchangés)
// ---------------------------------------------------------------------------

/**
 * Affectation manuelle — Direction seulement (canEditGanttSchedule, voir
 * routes.ts). Depuis le moteur automatique (31 août 2026), il ne s'agit plus
 * d'une affectation attendue mais d'une dérogation/pin OPTIONNEL : nul, le
 * moteur choisit lui-même l'employé qualifié le plus disponible (voir
 * gantt-schedule.ts, runGanttSchedule) ; rempli, force cet employé précis.
 * Aucune vérification de compétence : une dérogation volontaire reste permise
 * (spec confirmée, inchangé).
 */
export async function assignProductionTask(taskId: string, employeeId: string | null): Promise<void> {
  const task = await prisma.projectTask.findUnique({ where: { id: taskId } });
  if (!task) throw new HttpError(404, "Tâche introuvable.");
  if (employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || !employee.active) throw new HttpError(400, "Employé introuvable ou inactif.");
  }
  await prisma.projectTask.update({ where: { id: taskId }, data: { assignedEmployeeId: employeeId } });
}

/** Marquer complétée/non complétée — geste explicite de Direction, jamais un effet de bord des heures consommées ni d'une date prédite. */
export async function setProductionTaskCompleted(taskId: string, completed: boolean): Promise<void> {
  const task = await prisma.projectTask.findUnique({ where: { id: taskId } });
  if (!task) throw new HttpError(404, "Tâche introuvable.");
  await prisma.projectTask.update({ where: { id: taskId }, data: { ganttCompleted: completed } });
}
