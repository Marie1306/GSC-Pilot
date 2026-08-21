/**
 * Paramètres — tâches punchables par catégorie (PunchableTask). Direction
 * seulement — ajouter/renommer/réordonner/désactiver. Une tâche désactivée
 * n'apparaît plus au choix du punch mais reste référencée par les punchs
 * déjà enregistrés (TimeEntry.taskId, jamais cassé) — même mécanisme que
 * les classes de service (TechLevel) et catégories d'achat.
 *
 * Catégories confirmées le 20 août 2026 : les 6 catégories déjà punchables
 * (conception/fabrication/programmation/assemblage/installation/service)
 * plus "internal" (Amélioration GSC, déjà anticipée au schéma). Déplacement/
 * Livraison/Perte de temps (vus dans la v19) déclinés pour l'instant —
 * jamais ajoutés sans confirmation.
 *
 * Correction du 21 août 2026 (Marie) : pour les 5 catégories liées au
 * budgétaire (conception/fabrication/panelProgramming/assemblyTest/
 * installationLabor), une tâche punchable N'EST PAS une entité indépendante
 * — c'est la MÊME chose qu'une ligne du modèle de budgétaire
 * (BudgetModelRow), déjà lié 1:1 via PunchableTask.budgetModelRowId (voir
 * schema.prisma, migration 20260818020507). Ajouter une tâche ici pour ces
 * catégories crée donc AUSSI la BudgetModelRow (avec son taux horaire —
 * jamais deviné, toujours saisi), pas seulement la tâche : sans ça, un
 * punch contre un PROJET pour cette tâche échouait (resolvePunchTarget,
 * timeEntries/service.ts, exige task.budgetModelRowId pour un projet).
 * Renommer/désactiver/changer le taux depuis cet écran propage pareillement
 * à la ligne liée — un seul geste, un seul enregistrement, jamais deux
 * écrans à synchroniser manuellement. Service et Amélioration GSC restent
 * des tâches indépendantes (budgetModelRowId toujours nul) — aucune notion
 * de ligne de budgétaire ne s'applique à elles.
 *
 * specificServiceRate (tarif spécifique par tâche, confirmé le 20 août 2026)
 * n'a de sens que pour une tâche de catégorie "service" (remplace le taux de
 * la classe choisie au punch — voir service-calls.ts) — pas de contrainte
 * serveur là-dessus : l'interface ne propose ce champ que pour "service",
 * même principe que les champs classe/type de temps qui ne s'appliquent
 * déjà qu'à ce projectType.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { PunchableTask, BudgetCategory } from "../../generated/prisma/client.js";

const BUDGET_LINKED_CATEGORIES = new Set(["conception", "fabrication", "panelProgramming", "assemblyTest", "installationLabor"]);

export interface PunchableTaskDto {
  id: string;
  category: string;
  label: string;
  active: boolean;
  sortOrder: number;
  specificServiceRate: number | null;
  budgetModelRowId: string | null;
  hourlyRate: number | null;
}

function toDto(row: PunchableTask & { budgetModelRow?: { hourlyRate: unknown } | null }): PunchableTaskDto {
  return {
    id: row.id,
    category: row.category,
    label: row.label,
    active: row.active,
    sortOrder: row.sortOrder,
    specificServiceRate: row.specificServiceRate !== null ? Number(row.specificServiceRate) : null,
    budgetModelRowId: row.budgetModelRowId,
    hourlyRate: row.budgetModelRow ? Number(row.budgetModelRow.hourlyRate) : null,
  };
}

export async function listPunchableTasks(): Promise<PunchableTaskDto[]> {
  const rows = await prisma.punchableTask.findMany({
    include: { budgetModelRow: { select: { hourlyRate: true } } },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
  return rows.map(toDto);
}

/**
 * Crée à la fois la BudgetModelRow (section = modèle courant, catégorie
 * demandée) ET la PunchableTask liée, dans une seule transaction — jamais
 * l'une sans l'autre pour ces catégories.
 */
async function createBudgetLinkedTask(category: string, label: string, hourlyRate: number): Promise<PunchableTaskDto> {
  const budgetModel = await prisma.budgetModel.findFirst();
  if (!budgetModel) throw new HttpError(500, "Modèle de budgétaire non initialisé — lancer le seed.");
  const section = await prisma.budgetModelSection.findFirst({
    where: { budgetModelId: budgetModel.id, category: category as BudgetCategory },
  });
  if (!section) throw new HttpError(500, `Aucune section de modèle de budgétaire pour la catégorie « ${category} ».`);

  const slug =
    label
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `ligne-${Date.now()}`;
  const rowCount = await prisma.budgetModelRow.count({ where: { sectionId: section.id } });

  return prisma.$transaction(async (tx) => {
    const row = await tx.budgetModelRow.create({
      data: { sectionId: section.id, slug, label, hourlyRate, sortOrder: rowCount },
    });
    const task = await tx.punchableTask.create({
      data: { category, label, sortOrder: rowCount, budgetModelRowId: row.id },
      include: { budgetModelRow: { select: { hourlyRate: true } } },
    });
    return toDto(task);
  });
}

export async function createPunchableTask(category: string, label: string, hourlyRate?: number): Promise<PunchableTaskDto> {
  if (BUDGET_LINKED_CATEGORIES.has(category)) {
    if (hourlyRate === undefined || !(hourlyRate > 0)) {
      throw new HttpError(400, "Le taux horaire est requis pour une tâche liée au budgétaire — jamais deviné.");
    }
    return createBudgetLinkedTask(category, label, hourlyRate);
  }
  const count = await prisma.punchableTask.count({ where: { category } });
  const row = await prisma.punchableTask.create({ data: { category, label, sortOrder: count } });
  return toDto(row);
}

export interface PunchableTaskUpdate {
  label?: string;
  active?: boolean;
  specificServiceRate?: number | null;
  hourlyRate?: number;
}

/**
 * label/active/hourlyRate se propagent à la BudgetModelRow liée (si elle
 * existe) dans la MÊME transaction — un seul geste, jamais deux écrans à
 * synchroniser (voir en-tête du fichier). specificServiceRate ne s'applique
 * qu'à une tâche "service", jamais liée à une ligne de budgétaire — jamais
 * propagé.
 */
export async function updatePunchableTask(id: string, update: PunchableTaskUpdate): Promise<PunchableTaskDto> {
  const existing = await prisma.punchableTask.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Tâche introuvable.");

  const task = await prisma.$transaction(async (tx) => {
    const row = await tx.punchableTask.update({
      where: { id },
      data: {
        ...(update.label !== undefined && { label: update.label }),
        ...(update.active !== undefined && { active: update.active }),
        ...(update.specificServiceRate !== undefined && { specificServiceRate: update.specificServiceRate }),
      },
      include: { budgetModelRow: { select: { hourlyRate: true } } },
    });
    if (existing.budgetModelRowId && (update.label !== undefined || update.active !== undefined || update.hourlyRate !== undefined)) {
      await tx.budgetModelRow.update({
        where: { id: existing.budgetModelRowId },
        data: {
          ...(update.label !== undefined && { label: update.label }),
          ...(update.active !== undefined && { active: update.active }),
          ...(update.hourlyRate !== undefined && { hourlyRate: update.hourlyRate }),
        },
      });
    }
    return row;
  });

  // hourlyRate affiché reflète la BudgetModelRow — relire après la
  // propagation ci-dessus plutôt que de dupliquer le calcul.
  if (existing.budgetModelRowId && update.hourlyRate !== undefined) {
    const refreshed = await prisma.punchableTask.findUniqueOrThrow({
      where: { id },
      include: { budgetModelRow: { select: { hourlyRate: true } } },
    });
    return toDto(refreshed);
  }
  return toDto(task);
}

/** Échange le sortOrder avec le voisin immédiat DE LA MÊME CATÉGORIE — sans effet en bout de liste. */
export async function movePunchableTask(id: string, direction: "up" | "down"): Promise<PunchableTaskDto[]> {
  const existing = await prisma.punchableTask.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Tâche introuvable.");

  const siblings = await prisma.punchableTask.findMany({ where: { category: existing.category }, orderBy: { sortOrder: "asc" } });
  const index = siblings.findIndex((row) => row.id === id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;

  if (swapIndex >= 0 && swapIndex < siblings.length) {
    const current = siblings[index]!;
    const swapWith = siblings[swapIndex]!;
    await prisma.$transaction([
      prisma.punchableTask.update({ where: { id: current.id }, data: { sortOrder: swapWith.sortOrder } }),
      prisma.punchableTask.update({ where: { id: swapWith.id }, data: { sortOrder: current.sortOrder } }),
    ]);
  }

  return listPunchableTasks();
}
