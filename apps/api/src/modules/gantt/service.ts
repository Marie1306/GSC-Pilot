/**
 * GSC Pilot — Gantt de production (21 août 2026, phase A)
 *
 * Tableau de production réel : tâches issues des sous-assemblages (module
 * Sous-assemblages) et des avenants (module Avenants), leurs dépendances,
 * l'affectation d'employé et la complétion — geste explicite, jamais un
 * effet de bord des heures consommées (ganttCompleted, voir schema.prisma).
 *
 * Volontairement SANS moteur de planification automatique (horizon
 * dynamique, capacité/utilisation par employé, semaine québécoise,
 * vacances, interruptions, priorité automatique des roulements) — spec
 * confirmée mais algorithme non trivial (v19 en a un, jamais testé en
 * conditions réelles) : phase séparée, à confirmer avec l'utilisatrice
 * avant de deviner sa forme exacte plutôt que de l'improviser ici.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

export interface ProductionTaskDto {
  id: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  name: string;
  category: string;
  subcategory: string | null;
  skill: string | null;
  plannedHours: number;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  ganttCompleted: boolean;
  blockedByNames: string[]; // tâches dépendances pas encore complétées — vide = prêt à démarrer
}

async function toDtos(
  tasks: {
    id: string;
    projectId: string;
    name: string;
    category: string;
    subcategory: string | null;
    skill: string | null;
    plannedHours: unknown;
    assignedEmployeeId: string | null;
    ganttCompleted: boolean;
    dependsOn: { dependsOnId: string }[];
  }[],
  projectById: Map<string, { projectNumber: string; name: string }>,
): Promise<ProductionTaskDto[]> {
  const employeeIds = [...new Set(tasks.map((t) => t.assignedEmployeeId).filter((v): v is string => !!v))];
  const employees = employeeIds.length ? await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } }) : [];
  const employeeNameById = new Map(employees.map((e) => [e.id, e.name]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  return tasks
    .map((task) => {
      const project = projectById.get(task.projectId)!;
      const blockedByNames = task.dependsOn
        .map((dep) => taskById.get(dep.dependsOnId))
        .filter((dep): dep is NonNullable<typeof dep> => !!dep && !dep.ganttCompleted)
        .map((dep) => dep.name);
      return {
        id: task.id,
        projectId: task.projectId,
        projectNumber: project.projectNumber,
        projectName: project.name,
        name: task.name,
        category: task.category,
        subcategory: task.subcategory,
        skill: task.skill,
        plannedHours: Number(task.plannedHours),
        assignedEmployeeId: task.assignedEmployeeId,
        assignedEmployeeName: task.assignedEmployeeId ? (employeeNameById.get(task.assignedEmployeeId) ?? "?") : null,
        ganttCompleted: task.ganttCompleted,
        blockedByNames,
      };
    })
    .sort((a, b) => a.projectNumber.localeCompare(b.projectNumber) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** Vue d'ensemble production — tous les projets actifs (ni fermés, ni supprimés). */
export async function listProductionTasks(): Promise<ProductionTaskDto[]> {
  const tasks = await prisma.projectTask.findMany({
    where: { project: { deletedAt: null, closedAt: null } },
    include: { dependsOn: true, project: { select: { id: true, projectNumber: true, name: true } } },
  });
  const projectById = new Map(tasks.map((t) => [t.project.id, { projectNumber: t.project.projectNumber, name: t.project.name }]));
  return toDtos(tasks, projectById);
}

export async function listProjectProductionTasks(projectId: string): Promise<ProductionTaskDto[]> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, projectNumber: true, name: true } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  const tasks = await prisma.projectTask.findMany({ where: { projectId }, include: { dependsOn: true } });
  return toDtos(
    tasks.map((t) => ({ ...t, projectId })),
    new Map([[project.id, { projectNumber: project.projectNumber, name: project.name }]]),
  );
}

/** Affectation manuelle — Direction seulement (canEditGanttSchedule, voir routes.ts). Aucune vérification de compétence : une dérogation volontaire reste permise (spec confirmée). */
export async function assignProductionTask(taskId: string, employeeId: string | null): Promise<void> {
  const task = await prisma.projectTask.findUnique({ where: { id: taskId } });
  if (!task) throw new HttpError(404, "Tâche introuvable.");
  if (employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || !employee.active) throw new HttpError(400, "Employé introuvable ou inactif.");
  }
  await prisma.projectTask.update({ where: { id: taskId }, data: { assignedEmployeeId: employeeId } });
}

/** Marquer complétée/non complétée — geste explicite de Direction, jamais un effet de bord des heures consommées. */
export async function setProductionTaskCompleted(taskId: string, completed: boolean): Promise<void> {
  const task = await prisma.projectTask.findUnique({ where: { id: taskId } });
  if (!task) throw new HttpError(404, "Tâche introuvable.");
  await prisma.projectTask.update({ where: { id: taskId }, data: { ganttCompleted: completed } });
}
