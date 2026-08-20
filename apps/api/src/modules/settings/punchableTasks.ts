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
 * specificServiceRate (tarif spécifique par tâche, confirmé le 20 août 2026)
 * n'a de sens que pour une tâche de catégorie "service" (remplace le taux de
 * la classe choisie au punch — voir service-calls.ts) — pas de contrainte
 * serveur là-dessus : l'interface ne propose ce champ que pour "service",
 * même principe que les champs classe/type de temps qui ne s'appliquent
 * déjà qu'à ce projectType.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { PunchableTask } from "../../generated/prisma/client.js";

export interface PunchableTaskDto {
  id: string;
  category: string;
  label: string;
  active: boolean;
  sortOrder: number;
  specificServiceRate: number | null;
}

function toDto(row: PunchableTask): PunchableTaskDto {
  return {
    id: row.id,
    category: row.category,
    label: row.label,
    active: row.active,
    sortOrder: row.sortOrder,
    specificServiceRate: row.specificServiceRate !== null ? Number(row.specificServiceRate) : null,
  };
}

export async function listPunchableTasks(): Promise<PunchableTaskDto[]> {
  const rows = await prisma.punchableTask.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  return rows.map(toDto);
}

export async function createPunchableTask(category: string, label: string): Promise<PunchableTaskDto> {
  const count = await prisma.punchableTask.count({ where: { category } });
  const row = await prisma.punchableTask.create({ data: { category, label, sortOrder: count } });
  return toDto(row);
}

export interface PunchableTaskUpdate {
  label?: string;
  active?: boolean;
  specificServiceRate?: number | null;
}

export async function updatePunchableTask(id: string, update: PunchableTaskUpdate): Promise<PunchableTaskDto> {
  const existing = await prisma.punchableTask.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Tâche introuvable.");
  const row = await prisma.punchableTask.update({ where: { id }, data: update });
  return toDto(row);
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

  const updated = await prisma.punchableTask.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  return updated.map(toDto);
}
