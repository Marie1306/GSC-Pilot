/**
 * GSC Pilot — Roulements (20 août 2026)
 *
 * Confirmé (spécification, section « Roulements ») : proviennent en général
 * d'une demande client (via un budgétaire, comme un projet), mais doivent
 * aussi pouvoir être créés directement. Cycle de facturation par défaut : UN
 * SEUL PAIEMENT (pas DEFAULT_BILLING_SPLIT/Settings.defaultBillingSplit,
 * réservés aux projets) — computeBillingPlan (billing.ts, jamais modifié)
 * réutilisé avec un split à une seule étape. Fin de production → sortie
 * (3 modes seulement : Bon de livraison/magasinier, tiers, ramassage client
 * — PAS Installation, qui n'a de sens que pour un projet avec une section
 * Installation du budgétaire) → statut "Terminé" (même valeur interne
 * "ready_invoice" que Project, juste relabellisée côté interface) →
 * Post-mortem.
 *
 * Pas de comparatif planifié/réel ni de coût ici, contrairement à Project :
 * aucune donnée d'heures/achats n'existe pour un roulement (TimeEntry/
 * PurchaseRequest n'ont pas de rollingId) — seul le revenu (sold) est suivi.
 *
 * fulfillment.ts est réutilisé tel quel via son interface FulfillmentEntity
 * générique (déjà anticipée : Rolling a exactement les mêmes noms de champs
 * que Project pour la production/sortie) — aucune ligne de logique dupliquée
 * ou réimplémentée ici.
 */
import {
  computeBillingPlan,
  FULFILLMENT_MODES,
  chooseFulfillment as chooseFulfillmentPure,
  confirmFulfillment as confirmFulfillmentPure,
  canSeeFinancialValues,
  type FulfillmentMode,
  type Persona,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { getBudgetDetail } from "../budgets/service.js";
import { ensureContactRow } from "../clientRequests/service.js";
import { toInvoicePlanEntryDto, type InvoicePlanEntryDto } from "../projects/service.js";
import type { Rolling } from "../../generated/prisma/client.js";

// N'accepte jamais FULFILLMENT_MODES.INSTALLATION — seuls les 3 modes de
// livraison classiques ont un sens pour un roulement (spec confirmée).
type RollingFulfillmentMode = typeof FULFILLMENT_MODES.WAREHOUSE | typeof FULFILLMENT_MODES.MANUAL | typeof FULFILLMENT_MODES.PICKUP;

export interface RollingListItemDto {
  id: string;
  contactName: string;
  company: string | null;
  status: string;
  sold?: number;
  fulfillmentMode: string | null;
  fulfillmentStatus: string | null;
  createdAt: string;
}

export async function listRollings(viewerPersona: Persona): Promise<RollingListItemDto[]> {
  const showFinancials = canSeeFinancialValues(viewerPersona);
  const rollings = await prisma.rolling.findMany({
    include: { contact: { select: { name: true, company: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rollings.map((rolling) => ({
    id: rolling.id,
    contactName: rolling.contact.name,
    company: rolling.contact.company,
    status: rolling.status,
    fulfillmentMode: rolling.fulfillmentMode,
    fulfillmentStatus: rolling.fulfillmentStatus,
    createdAt: rolling.createdAt.toISOString(),
    ...(showFinancials && { sold: Number(rolling.sold) }),
  }));
}

export interface RollingDetailDto {
  id: string;
  contactName: string;
  company: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: string;
  budgetId: string | null;
  budgetDisplayId: string | null;
  clientRequestId: string | null;
  createdAt: string;
  sold?: number;
  productionCompleted: boolean;
  fulfillmentMode: string | null;
  fulfillmentStatus: string | null;
  fulfillmentAddress: string | null;
  fulfillmentDriverId: string | null;
  fulfillmentDriverName: string | null;
  fulfillmentScheduled: string | null;
  fulfillmentConfirmationNote: string | null;
  billingReady: boolean;
}

export async function getRollingDetail(id: string, viewerPersona: Persona): Promise<RollingDetailDto> {
  const rolling = await prisma.rolling.findUnique({
    where: { id },
    include: { contact: true, budget: { select: { displayId: true } } },
  });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");

  // fulfillmentDriverId reste un scalaire simple (pas de relation Prisma),
  // même patron que Delivery.driverEmployeeId — nom résolu séparément.
  const driver = rolling.fulfillmentDriverId
    ? await prisma.employee.findUnique({ where: { id: rolling.fulfillmentDriverId }, select: { name: true } })
    : null;

  return {
    id: rolling.id,
    contactName: rolling.contact.name,
    company: rolling.contact.company,
    contactPhone: rolling.contact.phone,
    contactEmail: rolling.contact.email,
    status: rolling.status,
    budgetId: rolling.budgetId,
    budgetDisplayId: rolling.budget?.displayId ?? null,
    clientRequestId: rolling.clientRequestId,
    createdAt: rolling.createdAt.toISOString(),
    productionCompleted: rolling.productionCompleted,
    fulfillmentMode: rolling.fulfillmentMode,
    fulfillmentStatus: rolling.fulfillmentStatus,
    fulfillmentAddress: rolling.fulfillmentAddress,
    fulfillmentDriverId: rolling.fulfillmentDriverId,
    fulfillmentDriverName: driver?.name ?? null,
    fulfillmentScheduled: rolling.fulfillmentScheduled?.toISOString() ?? null,
    fulfillmentConfirmationNote: rolling.fulfillmentConfirmationNote,
    billingReady: rolling.billingReady,
    ...(canSeeFinancialValues(viewerPersona) && { sold: Number(rolling.sold) }),
  };
}

/** Génère le plan de facturation à UN SEUL PAIEMENT — jamais DEFAULT_BILLING_SPLIT/Settings.defaultBillingSplit (réservés aux projets). */
async function createSinglePaymentPlan(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], rollingId: string, sold: number) {
  if (!(sold > 0)) return;
  const plan = computeBillingPlan(sold, [{ label: "Paiement", pct: 100 }]);
  await tx.invoicePlanEntry.createMany({
    data: plan.map((step, index) => ({ rollingId, label: step.label, pct: step.pct, amount: step.amount, status: step.status, sortOrder: index })),
  });
}

export async function convertBudgetToRolling(createdById: string, budgetId: string): Promise<Rolling> {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new HttpError(404, "Budgétaire introuvable.");
  if (budget.status !== "won") throw new HttpError(400, "Seul un budgétaire au statut « Contrat obtenu » peut être converti en roulement.");

  const [existingProject, existingRolling] = await Promise.all([
    prisma.project.findUnique({ where: { budgetId } }),
    prisma.rolling.findUnique({ where: { budgetId } }),
  ]);
  if (existingProject) throw new HttpError(400, "Ce budgétaire a déjà été converti en projet.");
  if (existingRolling) throw new HttpError(400, "Ce budgétaire a déjà été converti en roulement.");

  if (!budget.clientRequestId) {
    throw new HttpError(500, "Ce budgétaire n'a pas de demande client associée — impossible de déterminer le contact du roulement.");
  }
  const clientRequest = await prisma.clientRequest.findUnique({ where: { id: budget.clientRequestId }, select: { contactId: true } });
  if (!clientRequest) throw new HttpError(500, "Demande client introuvable pour ce budgétaire.");

  const detail = await getBudgetDetail(budgetId);
  const totalSale = detail.totals.totalSale;

  return prisma.$transaction(async (tx) => {
    const rolling = await tx.rolling.create({
      data: {
        contactId: clientRequest.contactId,
        clientRequestId: budget.clientRequestId,
        budgetId: budget.id,
        status: "active",
        sold: totalSale,
        createdById,
      },
    });
    await createSinglePaymentPlan(tx, rolling.id, totalSale);
    return rolling;
  });
}

export interface NewRollingContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

/**
 * Création directe (hors budgétaire/demande client) — Direction et
 * Propriétaire seulement (canCreateRollingDirectly, roles.ts). Pas de champ
 * "nom" : contrairement à Project, Rolling n'a pas de displayId/numéro/nom —
 * identifié par son contact (aucun format de numérotation confirmé, jamais
 * deviné — voir la remarque équivalente pour les lignes "roulement" de
 * Rapports).
 */
export async function createRollingDirect(createdById: string, newContact: NewRollingContactInput): Promise<Rolling> {
  if (!newContact.contactName?.trim()) throw new HttpError(400, "Le nom du contact est requis.");
  const contact = await ensureContactRow({ ...newContact, requestType: "rolling" });
  return prisma.rolling.create({
    data: { contactId: contact.id, status: "active", createdDirectly: true, createdById },
  });
}

/**
 * Remplir le prix vendu après une création directe (aucun budgétaire donc
 * aucun prix connu à la création) — même principe que updateProjectPlanning
 * (projects/service.ts) : plan généré une seule fois, la première fois que
 * sold devient > 0. Réservé aux roulements sans budgétaire d'origine (même
 * garde que côté projet).
 */
export async function updateRollingSold(rollingId: string, sold: number): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  if (rolling.budgetId) throw new HttpError(400, "Ce roulement a un budgétaire d'origine — le prix est gelé depuis la conversion.");

  await prisma.$transaction(async (tx) => {
    await tx.rolling.update({ where: { id: rollingId }, data: { sold } });
    if (sold > 0) {
      const existingPlan = await tx.invoicePlanEntry.count({ where: { rollingId } });
      if (existingPlan === 0) await createSinglePaymentPlan(tx, rollingId, sold);
    }
  });
}

export async function getRollingInvoicePlan(rollingId: string): Promise<InvoicePlanEntryDto[]> {
  const rows = await prisma.invoicePlanEntry.findMany({ where: { rollingId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map(toInvoicePlanEntryDto);
}

export async function markRollingProductionComplete(rollingId: string): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  if (rolling.productionCompleted) throw new HttpError(400, "La production est déjà marquée complétée.");
  await prisma.rolling.update({ where: { id: rollingId }, data: { productionCompleted: true } });
}

/** fulfillment.ts lance des Error ordinaires — reconverties ici en HttpError, même patron que projects/service.ts. */
function runFulfillmentStep<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Erreur de validation.");
  }
}

export interface ChooseRollingFulfillmentInput {
  mode: RollingFulfillmentMode;
  driverId?: string | null;
  address?: string;
  scheduled?: string | null;
}

export async function chooseRollingFulfillmentMode(rollingId: string, input: ChooseRollingFulfillmentInput): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  if (rolling.fulfillmentMode) throw new HttpError(400, "Le mode de sortie est déjà choisi pour ce roulement.");

  const updated = runFulfillmentStep(() =>
    chooseFulfillmentPure(
      { productionCompleted: rolling.productionCompleted, fulfillmentMode: (rolling.fulfillmentMode ?? undefined) as FulfillmentMode | undefined, status: rolling.status },
      input.mode,
      { driverId: input.driverId ?? null, address: input.address ?? "", scheduled: input.scheduled ?? null },
    ),
  );

  await prisma.$transaction(async (tx) => {
    await tx.rolling.update({
      where: { id: rollingId },
      data: {
        fulfillmentMode: updated.fulfillmentMode,
        fulfillmentScheduled: updated.fulfillmentScheduled ? new Date(updated.fulfillmentScheduled) : null,
        fulfillmentDriverId: updated.fulfillmentDriver,
        fulfillmentAddress: updated.fulfillmentAddress,
        fulfillmentStatus: updated.fulfillmentStatus,
      },
    });

    if (input.mode === FULFILLMENT_MODES.WAREHOUSE) {
      const settings = await tx.settings.findFirst();
      if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
      const displayId = `BL-${new Date().getFullYear()}-${String(settings.nextDeliveryNumber).padStart(4, "0")}`;
      await tx.delivery.create({
        data: {
          displayId,
          type: "rolling",
          rollingId,
          contactId: rolling.contactId,
          address: input.address || null,
          scheduledAt: input.scheduled ? new Date(input.scheduled) : null,
          driverEmployeeId: input.driverId || null,
          status: "planned",
        },
      });
      await tx.settings.update({ where: { id: settings.id }, data: { nextDeliveryNumber: settings.nextDeliveryNumber + 1 } });
    }
  });
}

/** Confirmer un mode tiers/ramassage — jamais pour warehouse (confirmé côté magasinier, module Livraisons). */
export async function confirmRollingFulfillment(rollingId: string, note?: string): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");

  const updated = runFulfillmentStep(() =>
    confirmFulfillmentPure(
      {
        fulfillmentMode: (rolling.fulfillmentMode ?? undefined) as FulfillmentMode | undefined,
        billingReady: rolling.billingReady,
        fulfillmentStatus: rolling.fulfillmentStatus ?? undefined,
        status: rolling.status,
      },
      note ?? "",
    ),
  );

  await prisma.rolling.update({
    where: { id: rollingId },
    data: {
      billingReady: updated.billingReady,
      fulfillmentStatus: updated.fulfillmentStatus,
      fulfillmentConfirmationNote: updated.fulfillmentConfirmationNote,
      status: updated.status,
    },
  });
}

export interface RollingPostMortemDto {
  id: string;
  contactName: string;
  company: string | null;
  sold?: number;
  postMortemDepassements: string | null;
  postMortemAmeliorations: string | null;
  postMortemRecommandation: string | null;
}

/**
 * Post-mortem (spec confirmée : « la livraison termine le roulement →
 * statut "Terminé" → apparaît au Post-mortem »). Volontairement SANS
 * comparatif/coût réel contrairement à getPostMortem (projects/service.ts)
 * — aucune donnée d'heures/achats n'existe pour un roulement, seul le
 * revenu est réel ici.
 */
export async function getRollingPostMortem(id: string, viewerPersona: Persona): Promise<RollingPostMortemDto> {
  const rolling = await prisma.rolling.findUnique({ where: { id }, include: { contact: { select: { name: true, company: true } } } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  return {
    id: rolling.id,
    contactName: rolling.contact.name,
    company: rolling.contact.company,
    postMortemDepassements: rolling.postMortemDepassements,
    postMortemAmeliorations: rolling.postMortemAmeliorations,
    postMortemRecommandation: rolling.postMortemRecommandation,
    ...(canSeeFinancialValues(viewerPersona) && { sold: Number(rolling.sold) }),
  };
}

export interface UpdateRollingPostMortemInput {
  depassements?: string;
  ameliorations?: string;
  recommandation?: string;
}

export async function updateRollingPostMortemAnalysis(rollingId: string, input: UpdateRollingPostMortemInput): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  await prisma.rolling.update({
    where: { id: rollingId },
    data: {
      ...(input.depassements !== undefined && { postMortemDepassements: input.depassements || null }),
      ...(input.ameliorations !== undefined && { postMortemAmeliorations: input.ameliorations || null }),
      ...(input.recommandation !== undefined && { postMortemRecommandation: input.recommandation || null }),
    },
  });
}
