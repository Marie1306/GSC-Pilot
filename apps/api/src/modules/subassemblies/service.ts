/**
 * GSC Pilot — Sous-assemblages de conception (21 août 2026)
 *
 * Réutilise subassembly.ts tel quel (declareSubassemblyReady/
 * markPartsListReady/declareAssemblyReady/subassemblyGanttTasks/
 * designerHistory) — aucune règle réimplémentée ici, seulement l'adaptateur
 * Prisma. `Subassembly.id` reprend tel quel l'identifiant composé de la
 * fonction pure (`${projectId}-${number}`) : la contrainte d'unicité de la
 * clé primaire fait double emploi avec la vérification de doublon déjà
 * faite par declareSubassemblyReady, sans champ supplémentaire.
 *
 * Les tâches Gantt générées (subassemblyGanttTasks) sont persistées comme
 * ProjectTask — createSubassemblyTasks ne reçoit QUE les tâches neuves à
 * créer (jamais un recalcul complet à ré-upserter) : à la création de la
 * liste de pièces, toutes les tâches sauf assemblage; au geste "assemblage
 * prêt", seulement la tâche assemblage (les autres existent déjà).
 */
import {
  declareSubassemblyReady,
  markPartsListReady,
  declareAssemblyReady,
  subassemblyGanttTasks,
  designerHistory,
  productionCategoryLabel,
  type Subassembly as PureSubassembly,
  type SubassemblyStatus,
  type GanttTask,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { Subassembly, PrismaClient } from "../../generated/prisma/client.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

function toPure(row: Subassembly): PureSubassembly {
  return {
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    declaredBy: row.declaredById,
    declaredAt: row.declaredAt.toISOString(),
    status: row.status as SubassemblyStatus,
    partsListPreparedBy: row.partsListPreparedById ?? undefined,
    partsListPreparedAt: row.partsListPreparedAt?.toISOString() ?? undefined,
    hoursByCategory: (row.hoursByCategory as Record<string, number> | null) ?? undefined,
    assemblyReadyDeclaredBy: row.assemblyReadyDeclaredById ?? undefined,
    assemblyReadyDeclaredAt: row.assemblyReadyDeclaredAt?.toISOString() ?? undefined,
  };
}

export interface SubassemblyDto {
  id: string;
  projectId: string;
  number: string;
  declaredByName: string;
  declaredAt: string;
  status: SubassemblyStatus;
  partsListPreparedByName: string | null;
  partsListPreparedAt: string | null;
  hoursByCategory: Record<string, number> | null;
  assemblyReadyDeclaredByName: string | null;
  assemblyReadyDeclaredAt: string | null;
}

async function toDtos(rows: Subassembly[]): Promise<SubassemblyDto[]> {
  const employeeIds = [...new Set(rows.flatMap((r) => [r.declaredById, r.partsListPreparedById, r.assemblyReadyDeclaredById].filter((v): v is string => !!v)))];
  const employees = employeeIds.length ? await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    declaredByName: nameById.get(row.declaredById) ?? "?",
    declaredAt: row.declaredAt.toISOString(),
    status: row.status as SubassemblyStatus,
    partsListPreparedByName: row.partsListPreparedById ? (nameById.get(row.partsListPreparedById) ?? "?") : null,
    partsListPreparedAt: row.partsListPreparedAt?.toISOString() ?? null,
    hoursByCategory: (row.hoursByCategory as Record<string, number> | null) ?? null,
    assemblyReadyDeclaredByName: row.assemblyReadyDeclaredById ? (nameById.get(row.assemblyReadyDeclaredById) ?? "?") : null,
    assemblyReadyDeclaredAt: row.assemblyReadyDeclaredAt?.toISOString() ?? null,
  }));
}

export async function listSubassembliesForProject(projectId: string): Promise<SubassemblyDto[]> {
  const rows = await prisma.subassembly.findMany({ where: { projectId }, orderBy: { declaredAt: "asc" } });
  return toDtos(rows);
}

/** Le mini Gantt du designer (spec confirmée) — tous ses sous-assemblages, tous projets confondus, dans l'ordre réel de déclaration. */
export async function listMySubassemblies(declaredById: string): Promise<SubassemblyDto[]> {
  const rows = await prisma.subassembly.findMany({ where: { declaredById } });
  const ordered = designerHistory(rows.map(toPure), declaredById);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return toDtos(ordered.map((entry) => byId.get(entry.id)!));
}

export interface PendingSubassemblyDto {
  id: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  number: string;
  declaredByName: string;
  declaredAt: string;
}

/** Sous-assemblages en attente de liste de pièces, toutes projets confondus — pour le Centre d'actions de Direction. */
export async function listPendingPartsListSubassemblies(): Promise<PendingSubassemblyDto[]> {
  const rows = await prisma.subassembly.findMany({
    where: { status: "pending_parts_list" },
    include: { project: { select: { projectNumber: true, name: true } } },
    orderBy: { declaredAt: "asc" },
  });
  const dtos = await toDtos(rows);
  const dtoById = new Map(dtos.map((d) => [d.id, d]));
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    projectNumber: row.project.projectNumber,
    projectName: row.project.name,
    number: row.number,
    declaredByName: dtoById.get(row.id)!.declaredByName,
    declaredAt: row.declaredAt.toISOString(),
  }));
}

export async function declareSubassemblyForProject(projectId: string, number: string, declaredById: string): Promise<SubassemblyDto> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  const trimmed = number?.trim();
  if (!trimmed) throw new HttpError(400, "Le numéro de l'assemblage est requis.");

  const existing = await prisma.subassembly.findMany({ where: { projectId } });
  let entry: PureSubassembly;
  try {
    entry = declareSubassemblyReady(existing.map(toPure), { projectId, number: trimmed, declaredBy: declaredById });
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Erreur de validation.");
  }

  const row = await prisma.subassembly.create({
    data: { id: entry.id, projectId, number: trimmed, declaredById, status: entry.status },
  });
  return (await toDtos([row]))[0]!;
}

/** Crée les ProjectTask neufs d'un lot de GanttTask, puis leurs dépendances (référencées par id de tâche pure). */
async function createSubassemblyTasks(tx: Tx, projectId: string, subassembly: Subassembly, tasks: GanttTask[]): Promise<void> {
  const idMap = new Map<string, string>();
  for (const task of tasks) {
    const created = await tx.projectTask.create({
      data: {
        projectId,
        subassemblyId: subassembly.id,
        name: `${subassembly.number} — ${productionCategoryLabel(task.category)}`,
        category: task.category,
        skill: task.category,
        plannedHours: task.hours,
      },
    });
    idMap.set(task.id, created.id);
  }
  for (const task of tasks) {
    for (const depId of task.dependencies) {
      const dependsOnRealId = idMap.get(depId);
      const taskRealId = idMap.get(task.id);
      if (dependsOnRealId && taskRealId) {
        await tx.projectTaskDependency.create({ data: { taskId: taskRealId, dependsOnId: dependsOnRealId } });
      }
    }
  }
}

export async function markSubassemblyPartsListReady(
  id: string,
  preparedById: string,
  hoursByCategory: Record<string, number>,
): Promise<SubassemblyDto> {
  const row = await prisma.subassembly.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, "Assemblage introuvable.");

  const pure = toPure(row);
  try {
    markPartsListReady(pure, preparedById, hoursByCategory);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Erreur de validation.");
  }
  const tasks = subassemblyGanttTasks(pure); // pas encore d'assemblage (assemblyReadyDeclaredBy absent à ce stade)

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.subassembly.update({
      where: { id },
      data: {
        status: pure.status,
        partsListPreparedById: preparedById,
        partsListPreparedAt: new Date(),
        hoursByCategory: pure.hoursByCategory,
      },
    });
    await createSubassemblyTasks(tx, row.projectId, saved, tasks);
    return saved;
  });
  return (await toDtos([updated]))[0]!;
}

export async function declareSubassemblyAssemblyReady(id: string, declaredById: string): Promise<SubassemblyDto> {
  const row = await prisma.subassembly.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, "Assemblage introuvable.");
  if (row.assemblyReadyDeclaredById) throw new HttpError(400, "L'assemblage est déjà déclaré prêt pour cet assemblage.");

  const pure = toPure(row);
  try {
    declareAssemblyReady(pure, declaredById);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Erreur de validation.");
  }
  const tasks = subassemblyGanttTasks(pure).filter((t) => t.category === "assemblage"); // seule tâche neuve à ce stade

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.subassembly.update({
      where: { id },
      data: { assemblyReadyDeclaredById: declaredById, assemblyReadyDeclaredAt: new Date() },
    });
    await createSubassemblyTasks(tx, row.projectId, saved, tasks);
    return saved;
  });
  return (await toDtos([updated]))[0]!;
}
