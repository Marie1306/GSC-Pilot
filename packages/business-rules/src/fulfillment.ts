/**
 * GSC Pilot — Livraisons et roulements
 *
 * Confirmé le 8-9 août 2026. Deux étapes séparées, pas une (bug trouvé et
 * corrigé dans la v19 : le Propriétaire avait accès aux deux, ne devrait
 * en avoir à aucune) :
 *   1. Marquer la production complétée — Direction seulement.
 *   2. Choisir le mode de sortie — Direction et Administration.
 * Voir roles.ts pour canMarkProductionComplete / canChooseFulfillmentMode.
 *
 * Porté depuis docs/handoff/03-modules-v01/fulfillment.js — typage ajouté
 * uniquement, aucune ligne de logique changée (voir CLAUDE.md).
 */

export const FULFILLMENT_MODES = Object.freeze({
  WAREHOUSE: "warehouse", // Bon de livraison — assigné au magasinier
  MANUAL: "manual", // Livraison par un tiers — bon papier maison, aucune action ensuite
  PICKUP: "pickup", // Ramassage par le client — aucune action ensuite
  INSTALLATION: "installation", // GSC installe chez le client elle-même
} as const);

export type FulfillmentMode = (typeof FULFILLMENT_MODES)[keyof typeof FULFILLMENT_MODES];

export interface FulfillmentEntity {
  productionCompleted?: boolean;
  fulfillmentMode?: FulfillmentMode;
  fulfillmentScheduled?: string | null;
  fulfillmentDriver?: string | null;
  fulfillmentAddress?: string;
  fulfillmentStatus?: string;
  billingReady?: boolean;
  fulfillmentConfirmationNote?: string;
  status?: string;
}

/**
 * Est-ce que ce mode termine l'entité (roulement/projet) une fois confirmé?
 * Confirmé : les 3 modes de livraison classiques terminent et envoient au
 * Post-mortem. Installation fait exception — le travail continue
 * (heures et achats d'installation encore à venir), donc l'entité doit
 * rester ouverte. Ne jamais fermer automatiquement sur ce mode.
 */
export function fulfillmentClosesEntity(mode: FulfillmentMode): boolean {
  return mode !== FULFILLMENT_MODES.INSTALLATION;
}

/**
 * Représente la transition production → sortie. Ne fait que calculer le
 * prochain état — à qui de droit (roles.ts) de vérifier la permission
 * avant d'appliquer.
 */
export function chooseFulfillment(
  entity: FulfillmentEntity,
  mode: FulfillmentMode,
  { driverId = null, address = "", scheduled = null }: { driverId?: string | null; address?: string; scheduled?: string | null } = {},
): FulfillmentEntity {
  if (!entity.productionCompleted) {
    throw new Error("La production doit être marquée complétée avant de choisir un mode de sortie.");
  }
  if (!(Object.values(FULFILLMENT_MODES) as string[]).includes(mode)) {
    throw new Error(`Mode de sortie inconnu: ${mode}`);
  }
  entity.fulfillmentMode = mode;
  entity.fulfillmentScheduled = scheduled;
  if (mode === FULFILLMENT_MODES.WAREHOUSE) {
    entity.fulfillmentDriver = driverId;
    entity.fulfillmentAddress = address;
    entity.fulfillmentStatus = "planned"; // le magasinier doit encore livrer et faire signer
  } else if (mode === FULFILLMENT_MODES.INSTALLATION) {
    entity.fulfillmentStatus = "installation_planned"; // reste ouvert, pas de billingReady ici
  } else {
    entity.fulfillmentStatus = "awaiting_confirmation"; // manual/pickup — reste à confirmer
  }
  return entity;
}

/**
 * Confirmer un ramassage ou une livraison par un tiers (jamais pour
 * warehouse, qui se confirme via le Bon de livraison lui-même; jamais
 * pour installation, qui ne se "confirme" pas de cette façon puisque le
 * travail continue).
 */
export function confirmFulfillment(entity: FulfillmentEntity, note: string = ""): FulfillmentEntity {
  if (!([FULFILLMENT_MODES.MANUAL, FULFILLMENT_MODES.PICKUP] as (FulfillmentMode | undefined)[]).includes(entity.fulfillmentMode)) {
    throw new Error("La confirmation ne s'applique qu'aux modes tiers ou ramassage.");
  }
  entity.billingReady = true;
  entity.fulfillmentStatus = "completed";
  entity.fulfillmentConfirmationNote = note;
  if (fulfillmentClosesEntity(entity.fulfillmentMode as FulfillmentMode)) {
    entity.status = "ready_invoice";
  }
  return entity;
}
