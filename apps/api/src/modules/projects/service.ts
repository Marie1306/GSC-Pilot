/**
 * Projets — Phase 1 : conversion d'un budgétaire « Contrat obtenu » en
 * projet réel, et écran de détail « coup d'œil » seulement (les totaux
 * globaux). La table de comparaison planifié/réel par catégorie, le Gantt,
 * les sous-assemblages, le suivi des achats/heures réels et la facturation
 * restent hors de cette phase — voir la spécification confirmée, section
 * « Conversion Budgétaire → Projet — préparation » (12 août 2026) : leur
 * détail exact reste à vérifier avec l'utilisatrice avant de les construire.
 *
 * Répartition confirmée le 12 août 2026 : `plannedHours`/`plannedPurchases`
 * viennent des catégories du budgétaire selon leur `kind` (labor vs
 * purchase) — jamais des back-up, qui ont leurs propres champs séparés
 * (`backupHours`/`backupHoursCost`, `projectBackupAmount`). `laborHours`/
 * `laborCost` démarrent égaux à `plannedHours`/coût de main-d'œuvre à la
 * conversion, puis grossissent seuls avec chaque avenant (`amendments.ts`,
 * jamais modifié) — `plannedHours`/`actualHours` restent la référence figée
 * pour la comparaison, jamais touchés par un avenant.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { getBudgetDetail } from "../budgets/service.js";
import type { Project } from "../../generated/prisma/client.js";

export interface ConvertBudgetToProjectInput {
  name: string;
}

export async function convertBudgetToProject(createdById: string, budgetId: string, input: ConvertBudgetToProjectInput): Promise<Project> {
  const name = input.name?.trim();
  if (!name) throw new HttpError(400, "Le nom du projet est requis.");

  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new HttpError(404, "Budgétaire introuvable.");
  if (budget.status !== "won") throw new HttpError(400, "Seul un budgétaire au statut « Contrat obtenu » peut être converti en projet.");

  const existing = await prisma.project.findUnique({ where: { budgetId } });
  if (existing) throw new HttpError(400, "Ce budgétaire a déjà été converti en projet.");

  if (!budget.clientRequestId) {
    throw new HttpError(500, "Ce budgétaire n'a pas de demande client associée — impossible de déterminer le contact du projet.");
  }
  const clientRequest = await prisma.clientRequest.findUnique({ where: { id: budget.clientRequestId }, select: { contactId: true } });
  if (!clientRequest) throw new HttpError(500, "Demande client introuvable pour ce budgétaire.");

  const detail = await getBudgetDetail(budgetId);

  const laborSections = detail.sections.filter((section) => section.kind === "labor");
  const purchaseSections = detail.sections.filter((section) => section.kind === "purchase");
  const plannedHours = laborSections.reduce((sum, section) => sum + section.hours, 0);
  const laborCost = laborSections.reduce((sum, section) => sum + section.baseCost, 0);
  const plannedPurchases = purchaseSections.reduce((sum, section) => sum + section.baseCost, 0);

  const totalSale = detail.totals.totalSale;
  const totalBaseCost = detail.totals.totalBaseCost;
  const targetMarginPct = totalSale > 0 ? Math.round(((totalSale - totalBaseCost) / totalSale) * 100 * 100) / 100 : 0;

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const projectNumber = `${settings.projectNumberPrefix}-${String(settings.nextProjectNumber).padStart(4, "0")}`;

    const project = await tx.project.create({
      data: {
        projectNumber,
        name,
        contactId: clientRequest.contactId,
        clientRequestId: budget.clientRequestId,
        budgetId: budget.id,
        status: "active",
        sold: totalSale,
        plannedPurchases,
        plannedHours,
        laborHours: plannedHours,
        laborCost,
        backupHours: detail.backup.hours,
        backupHoursCost: detail.backup.baseCost,
        backupHourlyRate: detail.backupHourlyRate,
        projectBackupAmount: detail.projectBackup.baseCost,
        targetMarginPct,
        createdById,
      },
    });

    await tx.settings.update({ where: { id: settings.id }, data: { nextProjectNumber: settings.nextProjectNumber + 1 } });

    return project;
  });
}

export interface ProjectListItemDto {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  contactName: string;
  company: string | null;
  sold: number;
}

export async function listProjects(): Promise<ProjectListItemDto[]> {
  const projects = await prisma.project.findMany({
    include: { contact: { select: { name: true, company: true } } },
    orderBy: { projectNumber: "asc" },
  });
  return projects.map((project) => ({
    id: project.id,
    projectNumber: project.projectNumber,
    name: project.name,
    status: project.status,
    contactName: project.contact.name,
    company: project.contact.company,
    sold: Number(project.sold),
  }));
}

export interface ProjectDetailDto {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  contactName: string;
  company: string | null;
  budgetId: string | null;
  budgetDisplayId: string | null;
  createdAt: string;
  // Coup d'œil (capture d'écran v19, 12 août 2026) — le détail par catégorie
  // (table planifié/réel), le Gantt et le suivi des achats/heures réels
  // viennent dans une phase suivante.
  sold: number;
  plannedHours: number;
  actualHours: number;
  hoursUsedPct: number;
  plannedPurchases: number;
  actualPurchases: number;
  backupHours: number;
  backupHoursCost: number;
  projectBackupAmount: number;
  grossMargin: number;
  grossMarginPct: number;
  targetMarginPct: number | null;
}

export async function getProjectDetail(id: string): Promise<ProjectDetailDto> {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { contact: { select: { name: true, company: true } }, budget: { select: { displayId: true } } },
  });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  // Confirmé le 12 août 2026 : le back-up d'heures ET le back-up projet
  // sont déjà inclus, avec leur propre marge, dans "sold" (le prix vendu
  // total du budgétaire au moment de la conversion) — jamais un coût à
  // soustraire une deuxième fois ici. La marge réelle ne baisse que quand
  // un coût ADDITIONNEL survient après coup : un vrai punch ou un achat
  // réellement autorisé. Tant qu'aucun des deux n'existe (TimeEntry /
  // ProjectPurchaseEntry pas encore branchés en Phase 1), sold - 0 = sold,
  // donc 100 % — normal et attendu, pas une approximation.
  const sold = Number(project.sold);
  const actualCost = Number(project.actualPurchases);
  const grossMargin = round2(sold - actualCost);
  const grossMarginPct = sold > 0 ? round2((grossMargin / sold) * 100) : 0;
  const plannedHours = Number(project.plannedHours);
  const actualHours = Number(project.actualHours);

  return {
    id: project.id,
    projectNumber: project.projectNumber,
    name: project.name,
    status: project.status,
    contactName: project.contact.name,
    company: project.contact.company,
    budgetId: project.budgetId,
    budgetDisplayId: project.budget?.displayId ?? null,
    createdAt: project.createdAt.toISOString(),
    sold,
    plannedHours,
    actualHours,
    hoursUsedPct: plannedHours > 0 ? round2((actualHours / plannedHours) * 100) : 0,
    plannedPurchases: Number(project.plannedPurchases),
    actualPurchases: Number(project.actualPurchases),
    backupHours: Number(project.backupHours),
    backupHoursCost: Number(project.backupHoursCost),
    projectBackupAmount: Number(project.projectBackupAmount),
    grossMargin,
    grossMarginPct,
    targetMarginPct: project.targetMarginPct !== null ? Number(project.targetMarginPct) : null,
  };
}

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}
