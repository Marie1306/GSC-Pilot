/**
 * GSC Pilot — Checklist de production (21 août 2026)
 *
 * NOUVEAU module (pas un port) — indépendant du module Sous-assemblages
 * (confirmé explicitement par l'utilisatrice, aucun lien de schéma). Suit
 * les pièces FABRIQUÉES à l'interne (MEP→DXF→Plasma→Pliage→Usinage→
 * Soudage→CQ→Peinture, catalogue configurable) — pas les pièces achetées,
 * qui restent la liste rapide d'achats déjà existante (réutilisée telle
 * quelle côté interface, aucun code ici).
 *
 * Modèle confirmé Q&R avec l'utilisatrice :
 * - Une checklist = un contenant (projet + assemblage libre optionnel).
 * - Un item = une pièce OU un sous-assemblage (regroupement propre à ce
 *   module) — mêmes champs pour les deux, aucune règle ne force quelles
 *   étapes s'appliquent. Un item "piece" peut avoir un parent "subassembly"
 *   (même checklist) ; un "subassembly" reste toujours racine.
 * - Chaque étape configurée devient une ProductionChecklistItemStep par
 *   item, avec un état à 3 niveaux : active=false (grisé, ne s'applique
 *   pas), active=true+completed=false (s'applique, pas fait),
 *   active=true+completed=true (fait). "active" est choisi UNE FOIS par
 *   Direction à la création — cocher à la création ne marque JAMAIS
 *   complété (précision explicite du 21 août 2026).
 * - Un item disparaît de la vue active une fois toutes ses étapes actives
 *   complétées, mais reste enregistré en permanence (vue archive par
 *   projet, jamais supprimé).
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { listChecklistSteps } from "../settings/checklistCatalogs.js";
import type { ProductionChecklistItem, ProductionChecklistItemStep, ChecklistStep } from "../../generated/prisma/client.js";

export interface ChecklistDto {
  id: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  assemblyLabel: string | null;
  createdByName: string;
  createdAt: string;
}

export interface ChecklistItemStepDto {
  stepId: string;
  stepLabel: string;
  active: boolean;
  completed: boolean;
  completedByName: string | null;
  completedAt: string | null;
}

export interface ChecklistItemDto {
  id: string;
  checklistId: string;
  kind: string;
  parentItemId: string | null;
  parentNumber: string | null;
  number: string;
  quantity: number | null;
  thickness: string | null;
  material: string | null;
  shapeType: string | null;
  tubeShape: string | null;
  tubeOD: string | null;
  tubeID: string | null;
  tubeMeasurement1: string | null;
  tubeMeasurement2: string | null;
  tubeWallThickness: string | null;
  shaftMeasurement: string | null;
  note: string | null;
  createdByName: string;
  createdAt: string;
  steps: ChecklistItemStepDto[];
}

type ItemWithSteps = ProductionChecklistItem & { steps: (ProductionChecklistItemStep & { step: ChecklistStep })[] };

async function resolveEmployeeNames(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();
  const rows = await prisma.employee.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

function itemStepsToDto(steps: (ProductionChecklistItemStep & { step: ChecklistStep })[], nameById: Map<string, string>): ChecklistItemStepDto[] {
  return steps
    .slice()
    .sort((a, b) => a.step.sortOrder - b.step.sortOrder)
    .map((s) => ({
      stepId: s.stepId,
      stepLabel: s.step.label,
      active: s.active,
      completed: s.completed,
      completedByName: s.completedById ? (nameById.get(s.completedById) ?? "?") : null,
      completedAt: s.completedAt?.toISOString() ?? null,
    }));
}

function isItemActive(item: { steps: { active: boolean; completed: boolean }[] }): boolean {
  return item.steps.some((s) => s.active && !s.completed);
}

export async function createChecklist(projectId: string, createdById: string, assemblyLabel: string | undefined): Promise<ChecklistDto> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, projectNumber: true, name: true } });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  const row = await prisma.productionChecklist.create({
    data: { projectId, assemblyLabel: assemblyLabel?.trim() || null, createdById },
  });
  const nameById = await resolveEmployeeNames([createdById]);
  return {
    id: row.id,
    projectId: project.id,
    projectNumber: project.projectNumber,
    projectName: project.name,
    assemblyLabel: row.assemblyLabel,
    createdByName: nameById.get(createdById) ?? "?",
    createdAt: row.createdAt.toISOString(),
  };
}

export interface AddChecklistItemInput {
  kind: "piece" | "subassembly";
  parentItemId?: string;
  number: string;
  quantity?: number;
  thickness?: string;
  material?: string;
  shapeType?: string;
  tubeShape?: string;
  tubeOD?: string;
  tubeID?: string;
  tubeMeasurement1?: string;
  tubeMeasurement2?: string;
  tubeWallThickness?: string;
  shaftMeasurement?: string;
  note?: string;
  activeStepIds: string[];
}

export async function addChecklistItem(checklistId: string, createdById: string, input: AddChecklistItemInput): Promise<ChecklistItemDto> {
  const checklist = await prisma.productionChecklist.findUnique({ where: { id: checklistId } });
  if (!checklist) throw new HttpError(404, "Checklist introuvable.");
  if (!input.number.trim()) throw new HttpError(400, "Le numéro est requis.");

  if (input.kind === "subassembly" && input.parentItemId) {
    throw new HttpError(400, "Un sous-assemblage ne peut pas être rattaché à un autre sous-assemblage.");
  }
  if (input.parentItemId) {
    const parent = await prisma.productionChecklistItem.findUnique({ where: { id: input.parentItemId } });
    if (!parent || parent.checklistId !== checklistId) throw new HttpError(400, "Sous-assemblage parent introuvable dans cette checklist.");
    if (parent.kind !== "subassembly") throw new HttpError(400, "Le parent doit être un sous-assemblage.");
  }

  const activeSteps = await listChecklistSteps();
  const configuredSteps = activeSteps.filter((s) => s.active);

  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.productionChecklistItem.create({
      data: {
        checklistId,
        kind: input.kind,
        parentItemId: input.parentItemId ?? null,
        number: input.number.trim(),
        quantity: input.quantity ?? null,
        thickness: input.thickness || null,
        material: input.material || null,
        shapeType: input.shapeType || null,
        tubeShape: input.tubeShape || null,
        tubeOD: input.tubeOD || null,
        tubeID: input.tubeID || null,
        tubeMeasurement1: input.tubeMeasurement1 || null,
        tubeMeasurement2: input.tubeMeasurement2 || null,
        tubeWallThickness: input.tubeWallThickness || null,
        shaftMeasurement: input.shaftMeasurement || null,
        note: input.note || null,
        createdById,
      },
    });
    await tx.productionChecklistItemStep.createMany({
      data: configuredSteps.map((step) => ({ itemId: item.id, stepId: step.id, active: input.activeStepIds.includes(step.id) })),
    });
    return item;
  });

  const full = await prisma.productionChecklistItem.findUniqueOrThrow({ where: { id: created.id }, include: { steps: { include: { step: true } } } });
  const nameById = await resolveEmployeeNames([createdById]);
  const parentNumber = full.parentItemId
    ? ((await prisma.productionChecklistItem.findUnique({ where: { id: full.parentItemId }, select: { number: true } }))?.number ?? null)
    : null;
  return toItemDto(full, nameById, parentNumber);
}

function toItemDto(item: ItemWithSteps, nameById: Map<string, string>, parentNumber: string | null): ChecklistItemDto {
  return {
    id: item.id,
    checklistId: item.checklistId,
    kind: item.kind,
    parentItemId: item.parentItemId,
    parentNumber,
    number: item.number,
    quantity: item.quantity,
    thickness: item.thickness,
    material: item.material,
    shapeType: item.shapeType,
    tubeShape: item.tubeShape,
    tubeOD: item.tubeOD,
    tubeID: item.tubeID,
    tubeMeasurement1: item.tubeMeasurement1,
    tubeMeasurement2: item.tubeMeasurement2,
    tubeWallThickness: item.tubeWallThickness,
    shaftMeasurement: item.shaftMeasurement,
    note: item.note,
    createdByName: nameById.get(item.createdById) ?? "?",
    createdAt: item.createdAt.toISOString(),
    steps: itemStepsToDto(item.steps, nameById),
  };
}

export interface ActiveChecklistItemFilters {
  stepId?: string;
  thickness?: string;
}

export interface ActiveChecklistItemDto extends ChecklistItemDto {
  projectNumber: string;
  projectName: string;
  assemblyLabel: string | null;
}

/** Vue active, tous projets confondus — exclut un item une fois toutes ses étapes actives complétées (spec confirmée). */
export async function listActiveChecklistItems(filters: ActiveChecklistItemFilters): Promise<ActiveChecklistItemDto[]> {
  const items = await prisma.productionChecklistItem.findMany({
    where: {
      ...(filters.thickness && { thickness: filters.thickness }),
      ...(filters.stepId && { steps: { some: { stepId: filters.stepId, active: true, completed: false } } }),
    },
    include: {
      steps: { include: { step: true } },
      checklist: { select: { assemblyLabel: true, project: { select: { projectNumber: true, name: true } } } },
    },
  });
  const active = items.filter(isItemActive);
  const nameById = await resolveEmployeeNames([
    ...active.map((i) => i.createdById),
    ...active.flatMap((i) => i.steps.map((s) => s.completedById).filter((v): v is string => !!v)),
  ]);
  const parentIds = active.map((i) => i.parentItemId).filter((v): v is string => !!v);
  const parents = parentIds.length ? await prisma.productionChecklistItem.findMany({ where: { id: { in: parentIds } }, select: { id: true, number: true } }) : [];
  const parentNumberById = new Map(parents.map((p) => [p.id, p.number]));
  return active
    .map((item) => ({
      ...toItemDto(item, nameById, item.parentItemId ? (parentNumberById.get(item.parentItemId) ?? null) : null),
      projectNumber: item.checklist.project.projectNumber,
      projectName: item.checklist.project.name,
      assemblyLabel: item.checklist.assemblyLabel,
    }))
    .sort((a, b) => a.projectNumber.localeCompare(b.projectNumber) || a.number.localeCompare(b.number));
}

export interface ChecklistWithItemsDto extends ChecklistDto {
  items: ChecklistItemDto[];
}

/** Archive complète d'un projet — tout inclus, y compris les items entièrement complétés (jamais filtré ici). */
export async function listProjectChecklists(projectId: string): Promise<ChecklistWithItemsDto[]> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, projectNumber: true, name: true } });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  const checklists = await prisma.productionChecklist.findMany({
    where: { projectId },
    include: { items: { include: { steps: { include: { step: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const allItems = checklists.flatMap((c) => c.items);
  const nameById = await resolveEmployeeNames([
    ...checklists.map((c) => c.createdById),
    ...allItems.map((i) => i.createdById),
    ...allItems.flatMap((i) => i.steps.map((s) => s.completedById).filter((v): v is string => !!v)),
  ]);
  const numberById = new Map(allItems.map((i) => [i.id, i.number]));

  return checklists.map((checklist) => ({
    id: checklist.id,
    projectId: project.id,
    projectNumber: project.projectNumber,
    projectName: project.name,
    assemblyLabel: checklist.assemblyLabel,
    createdByName: nameById.get(checklist.createdById) ?? "?",
    createdAt: checklist.createdAt.toISOString(),
    items: checklist.items
      .map((item) => toItemDto(item, nameById, item.parentItemId ? (numberById.get(item.parentItemId) ?? null) : null))
      .sort((a, b) => a.number.localeCompare(b.number)),
  }));
}

export async function setChecklistItemStepCompleted(itemId: string, stepId: string, completed: boolean, actorId: string): Promise<void> {
  const row = await prisma.productionChecklistItemStep.findUnique({ where: { itemId_stepId: { itemId, stepId } } });
  if (!row) throw new HttpError(404, "Étape introuvable pour cet item.");
  if (!row.active) throw new HttpError(400, "Cette étape ne s'applique pas à cet item.");
  await prisma.productionChecklistItemStep.update({
    where: { itemId_stepId: { itemId, stepId } },
    data: completed ? { completed: true, completedById: actorId, completedAt: new Date() } : { completed: false, completedById: null, completedAt: null },
  });
}
