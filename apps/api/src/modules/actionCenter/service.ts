/**
 * GSC Pilot — Centre d'actions (21 août 2026)
 *
 * Confirmé explicitement par l'utilisatrice : « chaque action qui demande
 * un traitement, une approbation, etc se retrouve dans le centre d'action
 * des vues Propriétaire, Administration et Direction » — point central de
 * l'application. Chaque item réutilise le calcul déjà vérifié d'un autre
 * module, jamais une deuxième règle divergente :
 *   - Budgétaires prêts pour approbation d'envoi (canApproveBudgetForSending).
 *   - Achats en attente — rejoue EXACTEMENT canApprovePurchaseRequest
 *     (roles.ts) avec les vrais paramètres de délégation/seuils gelés,
 *     jamais une approximation "owner_pending → Direction" qui ignorerait
 *     la délégation ou l'escalade de seuil.
 *   - Facturation demandée mais pas encore enregistrée (canCreateInvoiceRecord).
 *   - Nouvelles demandes clients (statut "new", canCreateClientRequest) —
 *     ajouté le 23 août 2026 suite au rapport de l'utilisatrice : une
 *     demande fraîchement entrée doit être visible immédiatement, pas
 *     seulement une fois transmise au Propriétaire (item suivant).
 *   - Demandes clients transférées au Propriétaire, pas encore converties
 *     (transferClientRequestToOwner, déjà construit — voir clientRequests/
 *     service.ts, rien à ajouter côté mécanisme) — signal séparé et
 *     complémentaire du précédent, réservé au Propriétaire (spec confirmée).
 *   - Sous-assemblages déclarés prêts par le designer, en attente que
 *     Direction crée la liste de pièces (module Sous-assemblages, 21 août
 *     2026 — canPrepareSubassemblyPartsList, même geste qui débloque
 *     l'item ici).
 *   - Achats autorisés mais pas encore commandés (fulfillmentStatus ===
 *     "waiting", canManagePurchaseFulfillment) — "Commande à passer",
 *     distinct de "Achat à approuver" ci-dessus (26 août 2026, demande de
 *     l'utilisatrice). Jamais l'escalade de seuil de l'approbation : cette
 *     étape suit toujours l'autorisation (voir roles.ts, doc de la fonction).
 *   - Heures punchées en attente d'approbation (canApprovePunch), rejoue
 *     listTimeEntriesForApproval tel quel (timeEntries/service.ts) — ajouté
 *     le 26 août 2026 suite au rapport de l'utilisatrice : la catégorie
 *     n'existait pas alors que les achats avaient la leur.
 */
import {
  canApproveBudgetForSending,
  canApprovePurchaseRequest,
  canManagePurchaseFulfillment,
  canApprovePunch,
  canCreateInvoiceRecord,
  canCreateClientRequest,
  canPrepareSubassemblyPartsList,
  buildFrozenPurchaseThresholdsMap,
  type Persona,
} from "@gsc-pilot/business-rules";
import { loadDelegationSettings } from "../../auth/delegation.js";
import { listBudgets } from "../budgets/service.js";
import { listPurchaseRequests } from "../purchases/service.js";
import { listInvoiceEntries } from "../invoicing/service.js";
import { listClientRequests } from "../clientRequests/service.js";
import { listPendingPartsListSubassemblies } from "../subassemblies/service.js";
import { listTimeEntriesForApproval } from "../timeEntries/service.js";

export type ActionItemType =
  | "budget_approval"
  | "purchase_approval"
  | "purchase_to_order"
  | "invoicing"
  | "client_request_new"
  | "client_request_transmitted"
  | "subassembly_ready"
  | "hours_approval"
  | "followup_due";

export interface ActionItemDto {
  id: string;
  type: ActionItemType;
  typeLabel: string;
  label: string;
  sublabel: string;
  amount?: number;
  createdAt: string;
}

export async function getActionCenterItems(viewerPersona: Persona, viewerEmployeeId: string): Promise<ActionItemDto[]> {
  const items: ActionItemDto[] = [];
  const settings = await loadDelegationSettings();

  if (canApproveBudgetForSending(viewerPersona)) {
    const budgets = await listBudgets();
    for (const budget of budgets) {
      if (budget.status === "draft" && budget.summary?.trim() && budget.riskSummary?.trim()) {
        items.push({
          id: budget.id,
          type: "budget_approval",
          typeLabel: "Budgétaire à approuver",
          label: `${budget.displayId} — ${budget.company ?? budget.contactName}`,
          sublabel: "Prêt pour approbation d'envoi",
          amount: budget.totalSale,
          createdAt: budget.createdAt,
        });
      }
    }
  }

  // Rejoue canApprovePurchaseRequest tel quel — jamais "owner_pending →
  // Direction" en dur, qui ignorerait un délégué actif ou l'escalade de
  // seuil (voir purchases/routes.ts, assertCanActOnRequest, même patron).
  {
    const requests = await listPurchaseRequests({ id: viewerEmployeeId, persona: viewerPersona });
    for (const request of requests) {
      if (request.status !== "owner_pending" && request.status !== "boss_pending") continue;
      const thresholds = buildFrozenPurchaseThresholdsMap({
        category: request.categoryName,
        thresholdAmountAtSubmission: request.thresholdAmountAtSubmission ?? null,
      });
      const allowed = canApprovePurchaseRequest(
        settings,
        viewerPersona,
        { category: request.categoryName ?? undefined, amount: request.amount ?? 0, requesterPersona: request.requesterPersona },
        thresholds,
      );
      if (allowed) {
        items.push({
          id: request.id,
          type: "purchase_approval",
          typeLabel: "Achat à approuver",
          label: `${request.displayId} — ${request.description}`,
          sublabel: request.requesterName,
          amount: request.amount ?? undefined,
          createdAt: request.requestedAt,
        });
      }
    }

    // "Commande à passer" — achat déjà autorisé, en attente que la commande
    // soit effectivement passée (fulfillmentStatus === "waiting", posé
    // automatiquement à l'autorisation, voir purchases/service.ts). Même
    // porte que le suivi de commande (canManagePurchaseFulfillment), jamais
    // l'escalade de seuil de l'approbation ci-dessus (roles.ts, doc de la
    // fonction) — demande de l'utilisatrice le 26 août 2026.
    if (canManagePurchaseFulfillment(settings, viewerPersona)) {
      for (const request of requests) {
        if (request.status !== "authorized" || request.fulfillmentStatus !== "waiting") continue;
        items.push({
          id: request.id,
          type: "purchase_to_order",
          typeLabel: "Commande à passer",
          label: `${request.displayId} — ${request.description}`,
          sublabel: request.supplier ?? request.requesterName,
          amount: request.amount ?? undefined,
          createdAt: request.requestedAt,
        });
      }
    }
  }

  if (canCreateInvoiceRecord(viewerPersona)) {
    const entries = await listInvoiceEntries();
    for (const entry of entries) {
      if (!entry.invoiceNumber) {
        items.push({
          id: entry.id,
          type: "invoicing",
          typeLabel: "Facturation à traiter",
          label: `${entry.sourceLabel} — ${entry.label}`,
          sublabel: entry.clientLabel,
          amount: entry.amount,
          createdAt: entry.requestedAt!,
        });
      }
    }
  }

  // Nouvelle demande client = signal immédiat pour Direction/Administration/
  // Propriétaire dès l'entrée (rapport de l'utilisatrice, 23 août 2026 :
  // "doivent aussi afficher... dès qu'une nouvelle demande entre") — même
  // trio que canCreateClientRequest (roles.ts), distinct et complémentaire
  // de la transmission ci-dessous (qui reste un signal PROPRIÉTAIRE
  // spécifique, spec confirmée, ne pas retirer). Disparaît dès que Direction
  // fait avancer le statut (in_progress/lost) ou convertit en budgétaire
  // (statut "converted" posé automatiquement, voir clientRequests/service.ts).
  if (canCreateClientRequest(viewerPersona)) {
    const requests = await listClientRequests();
    for (const request of requests) {
      if (request.status === "new") {
        items.push({
          id: request.id,
          type: "client_request_new",
          typeLabel: "Nouvelle demande client",
          label: `${request.displayId} — ${request.company ?? request.contactName}`,
          sublabel: request.summary,
          createdAt: request.createdAt,
        });
      }
    }
  }

  // Suivi dossier — la date de relance arrivée ou dépassée ("Planifier un
  // suivi", ClientRequestOptionsMenu.tsx). Même trio que les 2 items
  // ci-dessus (canCreateClientRequest) : même document, même audience.
  // listClientRequests() exclut déjà converted/lost/deletedAt (voir sa
  // documentation), donc un suivi ne peut jamais rester affiché après
  // résolution de la demande — rien à filtrer ici en plus (demande de
  // l'utilisatrice, 31 août 2026).
  if (canCreateClientRequest(viewerPersona)) {
    const requests = await listClientRequests();
    const now = new Date();
    for (const request of requests) {
      if (request.nextFollowUp && new Date(request.nextFollowUp) <= now) {
        items.push({
          id: request.id,
          type: "followup_due",
          typeLabel: "Suivi dossier",
          label: `${request.displayId} — ${request.company ?? request.contactName}`,
          sublabel: `Relance prévue le ${request.nextFollowUp.slice(0, 10)}`,
          createdAt: request.nextFollowUp,
        });
      }
    }
  }

  // Transmission = signal spécifiquement destiné au Propriétaire (spec confirmée).
  if (viewerPersona === "boss") {
    const requests = await listClientRequests();
    for (const request of requests) {
      if (request.transmittedToOwnerAt) {
        items.push({
          id: request.id,
          type: "client_request_transmitted",
          typeLabel: "Demande transmise",
          label: `${request.displayId} — ${request.company ?? request.contactName}`,
          sublabel: request.summary,
          createdAt: request.transmittedToOwnerAt,
        });
      }
    }
  }

  if (canPrepareSubassemblyPartsList(viewerPersona)) {
    const pending = await listPendingPartsListSubassemblies();
    for (const subassembly of pending) {
      items.push({
        id: subassembly.id,
        type: "subassembly_ready",
        typeLabel: "Sous-assemblage à préparer",
        label: `${subassembly.projectNumber} — ${subassembly.projectName} · ${subassembly.number}`,
        sublabel: `Déclaré par ${subassembly.declaredByName}`,
        createdAt: subassembly.declaredAt,
      });
    }
  }

  // Heures punchées en attente d'approbation — rejoue listTimeEntriesForApproval
  // + canApprovePunch tel quel (timeEntries/service.ts, routes.ts), jamais un
  // deuxième filtre approximatif ici. Demande de l'utilisatrice le 26 août 2026.
  if (canApprovePunch(settings, viewerPersona)) {
    const entries = await listTimeEntriesForApproval(viewerPersona);
    for (const entry of entries) {
      items.push({
        id: entry.id,
        type: "hours_approval",
        typeLabel: "Heures à approuver",
        label: `${entry.employeeName} — ${entry.categoryLabel}`,
        sublabel: entry.projectLabel ?? entry.taskLabel ?? "Interne",
        createdAt: entry.endAt ?? entry.startAt,
      });
    }
  }

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
