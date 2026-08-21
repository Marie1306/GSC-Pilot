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
 *   - Demandes clients transférées au Propriétaire, pas encore converties
 *     (transferClientRequestToOwner, déjà construit — voir clientRequests/
 *     service.ts, rien à ajouter côté mécanisme).
 *   - Sous-assemblages déclarés prêts par le designer, en attente que
 *     Direction crée la liste de pièces (module Sous-assemblages, 21 août
 *     2026 — canPrepareSubassemblyPartsList, même geste qui débloque
 *     l'item ici).
 */
import {
  canApproveBudgetForSending,
  canApprovePurchaseRequest,
  canCreateInvoiceRecord,
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

export type ActionItemType = "budget_approval" | "purchase_approval" | "invoicing" | "client_request_transmitted" | "subassembly_ready";

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
    const settings = await loadDelegationSettings();
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

  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
