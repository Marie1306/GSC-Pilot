/**
 * Paramètres — taux par défaut du back-up d'heures pour les nouveaux
 * Budgétaires (BudgetModel.backupHourlyRate, singleton). Copié dans chaque
 * nouveau Budgétaire à sa création (voir budgets/service.ts) — modifier ce
 * taux n'affecte jamais les Budgétaires/projets déjà existants (backupRate
 * gelé sur chacun, même principe que partout ailleurs). L'éditeur complet
 * du modèle (catégories/lignes/prix — "Ouvrir le modèle vierge" dans la
 * v19) reste hors de cette passe : portée volontairement plus restreinte,
 * juste ce taux pour l'instant.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

export async function getBackupHourlyRate(): Promise<number> {
  const model = await prisma.budgetModel.findFirst();
  if (!model) throw new HttpError(500, "Modèle de budgétaire non initialisé — lancer le seed.");
  return Number(model.backupHourlyRate);
}

export async function updateBackupHourlyRate(rate: number, updatedById: string): Promise<number> {
  const model = await prisma.budgetModel.findFirst();
  if (!model) throw new HttpError(500, "Modèle de budgétaire non initialisé — lancer le seed.");
  const updated = await prisma.budgetModel.update({ where: { id: model.id }, data: { backupHourlyRate: rate, updatedById } });
  return Number(updated.backupHourlyRate);
}
