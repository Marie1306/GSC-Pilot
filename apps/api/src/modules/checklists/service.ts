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
  /** Contourne l'avertissement d'unicité (spec confirmée 21 août 2026 — « Ajouter quand même »). */
  force?: boolean;
}

/**
 * Unicité du numéro (pièce ou sous-assemblage) par PROJET, tous checklists
 * confondus (spec confirmée : deux projets différents peuvent réutiliser le
 * même numéro, jamais deux items du même projet) — avertissement
 * contournable (`force`), jamais un blocage définitif.
 */
async function findNumberConflict(projectId: string, number: string, excludeItemId?: string) {
  const existing = await prisma.productionChecklistItem.findFirst({
    where: {
      number: number.trim(),
      checklist: { projectId },
      ...(excludeItemId && { id: { not: excludeItemId } }),
    },
    include: { checklist: { select: { assemblyLabel: true } } },
  });
  return existing ? { assemblyLabel: existing.checklist.assemblyLabel } : null;
}

function conflictMessage(number: string, assemblyLabel: string | null): string {
  const where = assemblyLabel ? `l'assemblage ${assemblyLabel}` : "une autre checklist de ce projet";
  return `Le numéro « ${number.trim()} » existe déjà dans ${where}. Utilisez « Ajouter quand même » si c'est voulu.`;
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

  if (!input.force) {
    const conflict = await findNumberConflict(checklist.projectId, input.number);
    if (conflict) throw new HttpError(409, conflictMessage(input.number, conflict.assemblyLabel));
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

export interface UpdateChecklistItemInput {
  number?: string;
  quantity?: number | null;
  thickness?: string | null;
  material?: string | null;
  shapeType?: string | null;
  tubeShape?: string | null;
  tubeOD?: string | null;
  tubeID?: string | null;
  tubeMeasurement1?: string | null;
  tubeMeasurement2?: string | null;
  tubeWallThickness?: string | null;
  shaftMeasurement?: string | null;
  note?: string | null;
  activeStepIds?: string[];
  force?: boolean;
}

/**
 * Modification d'une ligne déjà enregistrée — réservée à Direction (spec
 * confirmée 21 août 2026 : « Toutes les lignes une fois enregistrées dans la
 * checklist doivent pouvoir rester modifiables par Direction »). Si une
 * étape redevient inactive, son état complété est réinitialisé (une étape
 * qui ne s'applique plus ne peut pas rester « faite »).
 */
export async function updateChecklistItem(itemId: string, input: UpdateChecklistItemInput): Promise<ChecklistItemDto> {
  const existing = await prisma.productionChecklistItem.findUnique({ where: { id: itemId }, include: { checklist: true } });
  if (!existing) throw new HttpError(404, "Item introuvable.");
  if (input.number !== undefined && !input.number.trim()) throw new HttpError(400, "Le numéro est requis.");

  if (input.number !== undefined && !input.force) {
    const conflict = await findNumberConflict(existing.checklist.projectId, input.number, itemId);
    if (conflict) throw new HttpError(409, conflictMessage(input.number, conflict.assemblyLabel));
  }

  await prisma.$transaction(async (tx) => {
    await tx.productionChecklistItem.update({
      where: { id: itemId },
      data: {
        ...(input.number !== undefined && { number: input.number.trim() }),
        ...(input.quantity !== undefined && { quantity: input.quantity }),
        ...(input.thickness !== undefined && { thickness: input.thickness || null }),
        ...(input.material !== undefined && { material: input.material || null }),
        ...(input.shapeType !== undefined && { shapeType: input.shapeType || null }),
        ...(input.tubeShape !== undefined && { tubeShape: input.tubeShape || null }),
        ...(input.tubeOD !== undefined && { tubeOD: input.tubeOD || null }),
        ...(input.tubeID !== undefined && { tubeID: input.tubeID || null }),
        ...(input.tubeMeasurement1 !== undefined && { tubeMeasurement1: input.tubeMeasurement1 || null }),
        ...(input.tubeMeasurement2 !== undefined && { tubeMeasurement2: input.tubeMeasurement2 || null }),
        ...(input.tubeWallThickness !== undefined && { tubeWallThickness: input.tubeWallThickness || null }),
        ...(input.shaftMeasurement !== undefined && { shaftMeasurement: input.shaftMeasurement || null }),
        ...(input.note !== undefined && { note: input.note || null }),
      },
    });

    if (input.activeStepIds) {
      const steps = await tx.productionChecklistItemStep.findMany({ where: { itemId } });
      for (const step of steps) {
        const shouldBeActive = input.activeStepIds.includes(step.stepId);
        if (shouldBeActive !== step.active) {
          await tx.productionChecklistItemStep.update({
            where: { id: step.id },
            data: shouldBeActive ? { active: true } : { active: false, completed: false, completedById: null, completedAt: null },
          });
        }
      }
    }
  });

  const full = await prisma.productionChecklistItem.findUniqueOrThrow({ where: { id: itemId }, include: { steps: { include: { step: true } } } });
  const nameById = await resolveEmployeeNames([full.createdById, ...full.steps.map((s) => s.completedById).filter((v): v is string => !!v)]);
  const parentNumber = full.parentItemId
    ? ((await prisma.productionChecklistItem.findUnique({ where: { id: full.parentItemId }, select: { number: true } }))?.number ?? null)
    : null;
  return toItemDto(full, nameById, parentNumber);
}

export interface ActiveChecklistProjectDto {
  projectId: string;
  projectNumber: string;
  projectName: string;
  activeChecklistCount: number;
}

/**
 * Projets ayant au moins une checklist active — alimente la grille de
 * cartes de la page Checklist (spec confirmée 21 août 2026 : navigation par
 * projet, « seulement lorsqu'il y a des checklist créée [et active] » —
 * une checklist entièrement complétée disparaît de cette liste, mais reste
 * dans l'archive du projet, jamais supprimée).
 */
export async function listProjectsWithActiveChecklists(): Promise<ActiveChecklistProjectDto[]> {
  const checklists = await prisma.productionChecklist.findMany({
    include: { project: { select: { id: true, projectNumber: true, name: true } }, items: { include: { steps: true } } },
  });

  const byProject = new Map<string, ActiveChecklistProjectDto>();
  for (const checklist of checklists) {
    if (!checklist.items.some(isItemActive)) continue;
    const entry = byProject.get(checklist.projectId) ?? {
      projectId: checklist.project.id,
      projectNumber: checklist.project.projectNumber,
      projectName: checklist.project.name,
      activeChecklistCount: 0,
    };
    entry.activeChecklistCount += 1;
    byProject.set(checklist.projectId, entry);
  }
  return [...byProject.values()].sort((a, b) => a.projectNumber.localeCompare(b.projectNumber));
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
