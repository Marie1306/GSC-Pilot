/**
 * GSC Pilot — Suppression PERMANENTE (purge), 17 novembre 2026.
 *
 * Demande explicite de Marie après avoir créé plusieurs dossiers test :
 * deleteProject/deleteRolling/deleteServiceCall (corbeille, deletedAt) ne
 * nettoient RIEN — ils masquent seulement la ligne principale, tout le
 * reste (punch, achats, factures, documents, Budgétaire/Soumission/
 * Confirmation de commande d'origine...) reste en base, toujours rattaché.
 * Vente externe n'avait même aucune fonction de suppression du tout.
 *
 * Ce module vide RÉELLEMENT les tables pour un dossier et tout ce qui lui
 * est rattaché — jamais restaurable, contrairement à settings/trash.ts.
 * Décisions confirmées explicitement par Marie (AskUserQuestion,
 * 17 novembre 2026) :
 * - Permanent, pas réversible.
 * - Fonctionne même si une facture a déjà été envoyée (pas de garde
 *   bloquante — le dossier purgé est un dossier de test, jamais un vrai
 *   client, donc l'invariant "une facture envoyée ne bouge jamais" ne
 *   s'applique pas ici par choix explicite).
 * - Direction seulement (canPurgeDossier, roles.ts) — PAS le Propriétaire,
 *   cohérent avec le palier déjà en place pour deleteProject/deleteRolling/
 *   deleteServiceCall (déjà OWNER seul), jamais étendu à BOSS ici non plus.
 * - Un Projet/Roulement purge aussi son Budgétaire d'origine (+ sa
 *   Soumission/Confirmation de commande) — ce Budgétaire lui appartient
 *   exclusivement (@unique des deux côtés), jamais partagé avec un autre
 *   dossier, donc rien n'est orphelin.
 *
 * Hors de portée, délibérément JAMAIS purgé (Marie ne l'a pas demandé) :
 * - Le dossier SEAO d'origine (s'il y en a un) — un bid-tracking indépendant
 *   avec une vraie valeur propre (documents, analyse IA, concurrents),
 *   contrairement au Budgétaire qui n'existe QUE pour ce dossier précis.
 *   Seulement détaché (projectId remis à null).
 * - La Demande client d'origine — remise à "in_progress" (même geste que
 *   deleteBudget), jamais supprimée : elle peut rester pertinente même sans
 *   le dossier qui en a découlé.
 *
 * Toutes les suppressions se font enfants-avant-parents, dans une seule
 * transaction, jamais en comptant sur une cascade DB implicite au-delà des
 * 3 `onDelete: Cascade` déjà déclarés au schéma (SoumissionLine/
 * ConfirmationDeCommandeLine/InvoicePlanEntryLine) — tout le reste est
 * supprimé explicitement, dans l'ordre exact que les contraintes FK
 * exigent, vérifié contre le schéma au complet avant d'écrire ce fichier.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Budgétaire d'origine + sa Soumission/Confirmation de commande — partagé
 * par purgeProject/purgeRolling (un Budget n'appartient jamais qu'à un seul
 * Projet OU un seul Roulement, @unique des deux côtés, jamais les deux).
 */
async function purgeBudgetChainInTx(tx: Prisma.TransactionClient, budgetId: string): Promise<void> {
  const soumissions = await tx.soumission.findMany({ where: { budgetId }, select: { id: true } });
  const soumissionIds = soumissions.map((s) => s.id);
  if (soumissionIds.length > 0) {
    // ConfirmationDeCommande référence Soumission (pas de cascade dans ce sens) —
    // doit être supprimée avant sa Soumission. ConfirmationDeCommandeLine
    // suit par onDelete:Cascade (schema.prisma), jamais supprimée à la main.
    await tx.confirmationDeCommande.deleteMany({ where: { soumissionId: { in: soumissionIds } } });
    // SoumissionLine suit par onDelete:Cascade, jamais supprimée à la main.
    await tx.soumission.deleteMany({ where: { id: { in: soumissionIds } } });
  }
  await tx.budgetNote.deleteMany({ where: { budgetId } });
  await tx.budgetRow.deleteMany({ where: { section: { budgetId } } });
  await tx.budgetSection.deleteMany({ where: { budgetId } });
  const budget = await tx.budget.findUnique({ where: { id: budgetId }, select: { clientRequestId: true } });
  if (budget?.clientRequestId) {
    await tx.clientRequest.update({ where: { id: budget.clientRequestId }, data: { budgetId: null, status: "in_progress" } });
  }
  await tx.budget.delete({ where: { id: budgetId } });
}

/**
 * Un Call de service au complet (dossier + tous ses Bons de travail et
 * leur contenu) — partagé par purgeServiceCall (standalone) ET par
 * purgeProject/purgeRolling pour chaque Call qui leur est rattaché
 * (ServiceCall.projectId/rollingId).
 */
async function purgeServiceCallInTx(tx: Prisma.TransactionClient, serviceCallId: string): Promise<void> {
  const bonsDeTravail = await tx.bonDeTravail.findMany({ where: { serviceCallId }, select: { id: true } });
  const btIds = bonsDeTravail.map((bt) => bt.id);
  if (btIds.length > 0) {
    await tx.timeEntry.deleteMany({ where: { bonDeTravailId: { in: btIds } } });
    await tx.serviceCallPart.deleteMany({ where: { bonDeTravailId: { in: btIds } } });
    await tx.serviceCallPhoto.deleteMany({ where: { bonDeTravailId: { in: btIds } } });
    // BonDeTravail.invoicePlanEntryId pointe VERS InvoicePlanEntry — doit
    // disparaître avant l'InvoicePlanEntry(serviceCallId) ci-dessous.
    await tx.bonDeTravail.deleteMany({ where: { id: { in: btIds } } });
  }
  // Facturation sélective (Chantier D) — une seule entrée par lot facturé,
  // jamais plusieurs BT de dossiers différents dans la même entrée. Cascade
  // InvoicePlanEntryLine automatique (onDelete:Cascade, schema.prisma).
  await tx.invoicePlanEntry.deleteMany({ where: { serviceCallId } });
  // ClientRequest.serviceCallId est la VRAIE FK (@unique, gérée côté
  // ClientRequest) — doit être vidée avant de supprimer le ServiceCall,
  // contrairement à Project/Rolling.clientRequestId (FK gérée dans l'autre
  // sens, voir purgeProject/purgeRolling).
  await tx.clientRequest.updateMany({ where: { serviceCallId }, data: { serviceCallId: null, status: "in_progress" } });
  // PurchaseRequest.serviceCallId : champ orphelin du schéma, aucune
  // relation Prisma, jamais lu/écrit nulle part (confirmé par grep avant
  // d'écrire ce fichier) — rien à faire ici.
  await tx.serviceCall.delete({ where: { id: serviceCallId } });
}

export async function purgeServiceCall(serviceCallId: string): Promise<void> {
  const call = await prisma.serviceCall.findUnique({ where: { id: serviceCallId }, select: { id: true } });
  if (!call) throw new HttpError(404, "Appel de service introuvable.");
  await prisma.$transaction((tx) => purgeServiceCallInTx(tx, serviceCallId));
}

export async function purgeProject(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  await prisma.$transaction(async (tx) => {
    // Calls de service rattachés — dossier complet, avant le reste (une
    // InvoicePlanEntry de Call ne doit jamais rester visible pour un
    // Projet qui n'existe plus).
    const serviceCalls = await tx.serviceCall.findMany({ where: { projectId }, select: { id: true } });
    for (const serviceCall of serviceCalls) await purgeServiceCallInTx(tx, serviceCall.id);

    // Punch direct sur le projet (pas via un Call de service).
    await tx.timeEntry.deleteMany({ where: { projectId } });

    // Checklist de production (items + étapes, enfants avant parents).
    const checklists = await tx.productionChecklist.findMany({ where: { projectId }, select: { id: true } });
    const checklistIds = checklists.map((c) => c.id);
    if (checklistIds.length > 0) {
      const items = await tx.productionChecklistItem.findMany({ where: { checklistId: { in: checklistIds } }, select: { id: true } });
      const itemIds = items.map((i) => i.id);
      if (itemIds.length > 0) await tx.productionChecklistItemStep.deleteMany({ where: { itemId: { in: itemIds } } });
      await tx.productionChecklistItem.deleteMany({ where: { checklistId: { in: checklistIds } } });
      await tx.productionChecklist.deleteMany({ where: { id: { in: checklistIds } } });
    }

    // Gantt (dépendances avant tâches) — avant Sous-assemblage/Avenant, que
    // ProjectTask peut référencer (subassemblyId/amendmentId).
    const tasks = await tx.projectTask.findMany({ where: { projectId }, select: { id: true } });
    const taskIds = tasks.map((t) => t.id);
    if (taskIds.length > 0) {
      await tx.projectTaskDependency.deleteMany({ where: { OR: [{ taskId: { in: taskIds } }, { dependsOnId: { in: taskIds } }] } });
      await tx.projectTask.deleteMany({ where: { id: { in: taskIds } } });
    }

    // Sous-assemblages (« Assemblage » à l'écran) et Avenants — maintenant
    // sûr, plus aucun ProjectTask ne les référence. Amendment avant
    // InvoicePlanEntry(projectId) ci-dessous : targetInvoicePlanEntryId
    // pointe VERS une InvoicePlanEntry de ce projet.
    await tx.subassembly.deleteMany({ where: { projectId } });
    await tx.amendment.deleteMany({ where: { projectId } });

    // Facturation (cascade InvoicePlanEntryLine automatique).
    await tx.invoicePlanEntry.deleteMany({ where: { projectId } });

    // Achats réels + demandes d'achat (photos avant les demandes elles-mêmes).
    await tx.projectPurchaseEntry.deleteMany({ where: { projectId } });
    const purchaseRequests = await tx.purchaseRequest.findMany({ where: { projectId }, select: { id: true } });
    const purchaseRequestIds = purchaseRequests.map((p) => p.id);
    if (purchaseRequestIds.length > 0) {
      await tx.purchaseRequestPhoto.deleteMany({ where: { purchaseRequestId: { in: purchaseRequestIds } } });
      await tx.purchaseRequest.deleteMany({ where: { id: { in: purchaseRequestIds } } });
    }

    // Livraisons, documents téléversés, historique de garantie, équipe.
    await tx.delivery.deleteMany({ where: { projectId } });
    await tx.projectDocument.deleteMany({ where: { projectId } });
    await tx.warrantyHistoryEntry.deleteMany({ where: { projectId } });
    await tx.projectTeamMember.deleteMany({ where: { projectId } });

    // Dossier SEAO d'origine — détaché seulement, jamais purgé (voir
    // en-tête du fichier).
    await tx.seaoFile.updateMany({ where: { projectId }, data: { projectId: null } });

    // Budgétaire d'origine (+ Soumission/Confirmation de commande) —
    // purgé aussi, confirmé explicitement par Marie.
    if (project.budgetId) await purgeBudgetChainInTx(tx, project.budgetId);

    // Demande client d'origine — Project détient la VRAIE FK (@unique),
    // donc aucun risque de violation en supprimant le Projet ; seulement
    // remise à "in_progress" par hygiène (même geste que deleteBudget).
    if (project.clientRequestId) {
      await tx.clientRequest.update({ where: { id: project.clientRequestId }, data: { status: "in_progress" } });
    }

    await tx.project.delete({ where: { id: projectId } });
  });
}

export async function purgeRolling(rollingId: string): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");

  await prisma.$transaction(async (tx) => {
    const serviceCalls = await tx.serviceCall.findMany({ where: { rollingId }, select: { id: true } });
    for (const serviceCall of serviceCalls) await purgeServiceCallInTx(tx, serviceCall.id);

    await tx.timeEntry.deleteMany({ where: { rollingId } });

    const tasks = await tx.projectTask.findMany({ where: { rollingId }, select: { id: true } });
    const taskIds = tasks.map((t) => t.id);
    if (taskIds.length > 0) {
      await tx.projectTaskDependency.deleteMany({ where: { OR: [{ taskId: { in: taskIds } }, { dependsOnId: { in: taskIds } }] } });
      await tx.projectTask.deleteMany({ where: { id: { in: taskIds } } });
    }

    // Pas de Sous-assemblage/Avenant/Checklist/Garantie/Équipe/SEAO pour un
    // Roulement — ces modèles exigent tous un projectId non nul (voir
    // schema.prisma), jamais applicables ici.
    await tx.invoicePlanEntry.deleteMany({ where: { rollingId } });
    await tx.projectPurchaseEntry.deleteMany({ where: { rollingId } });
    await tx.delivery.deleteMany({ where: { rollingId } });
    await tx.rollingDocument.deleteMany({ where: { rollingId } });

    if (rolling.budgetId) await purgeBudgetChainInTx(tx, rolling.budgetId);

    if (rolling.clientRequestId) {
      await tx.clientRequest.update({ where: { id: rolling.clientRequestId }, data: { status: "in_progress" } });
    }

    await tx.rolling.delete({ where: { id: rollingId } });
  });
}

export async function purgeExternalSale(externalSaleId: string): Promise<void> {
  const sale = await prisma.externalSale.findUnique({ where: { id: externalSaleId } });
  if (!sale) throw new HttpError(404, "Vente externe introuvable.");

  await prisma.$transaction(async (tx) => {
    // Aucun Call de service/Budgétaire possible pour une Vente externe
    // (jamais de projectId/rollingId/budgetId sur ce modèle) — portée bien
    // plus simple que Projet/Roulement.
    await tx.invoicePlanEntry.deleteMany({ where: { externalSaleId } });
    const purchaseRequests = await tx.purchaseRequest.findMany({ where: { externalSaleId }, select: { id: true } });
    const purchaseRequestIds = purchaseRequests.map((p) => p.id);
    if (purchaseRequestIds.length > 0) {
      await tx.purchaseRequestPhoto.deleteMany({ where: { purchaseRequestId: { in: purchaseRequestIds } } });
      await tx.purchaseRequest.deleteMany({ where: { id: { in: purchaseRequestIds } } });
    }
    await tx.delivery.deleteMany({ where: { externalSaleId } });
    await tx.externalSaleDocument.deleteMany({ where: { externalSaleId } });

    // ClientRequest.externalSaleId est la VRAIE FK (@unique, gérée côté
    // ClientRequest, même raison que ServiceCall ci-dessus) — doit être
    // vidée avant de supprimer la vente.
    await tx.clientRequest.updateMany({ where: { externalSaleId }, data: { externalSaleId: null, status: "in_progress" } });

    await tx.externalSale.delete({ where: { id: externalSaleId } });
  });
}
