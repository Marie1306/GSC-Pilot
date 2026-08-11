/**
 * GSC Pilot v01 — Rôles et permissions
 *
 * Pourquoi ce module existe : dans le prototype v19, 252 vérifications de
 * rôle sont éparpillées dans 16 vues, chacune écrite à la main, à même le
 * HTML généré. Ici, chaque règle confirmée n'existe qu'à un seul endroit,
 * sous un seul nom — tout futur module importe ces fonctions plutôt que de
 * réécrire ses propres `persona === "..."`.
 *
 * Chaque règle ci-dessous est sourcée dans GSC_Pilot_Specification_confirmee.md
 * (confirmée le 7-8 août 2026) — rien n'est deviné.
 */

export const ROLES = Object.freeze({
  OWNER: "owner",         // Direction
  ADMIN: "admin",         // Administration
  BOSS: "boss",           // Propriétaire
  MEMBER: "member",       // Employé
  WAREHOUSE: "warehouse", // Magasinier
});

const ALL_ROLES = Object.values(ROLES);

function assertRole(persona) {
  if (!ALL_ROLES.includes(persona)) {
    throw new Error(`Rôle inconnu: "${persona}" — un des ${ALL_ROLES.join(", ")} est attendu.`);
  }
}

// ---------------------------------------------------------------------------
// Délégation d'approbation
// Confirmé : Direction peut déléguer à Propriétaire ou Administration, pour
// une ou plusieurs catégories (heures, achats, service, modifications),
// avec une date de début/fin, une limite monétaire optionnelle et une
// justification obligatoire. « Modifications » est délibérément exclue par
// défaut — la Direction ne veut aucun changement structurel (taux par
// défaut, seuils, dossiers employés) pendant son absence.
// ---------------------------------------------------------------------------

export const DELEGATION_CATEGORIES = Object.freeze(["hours", "purchases", "service", "changes"]);

/** Qui peut mettre en place une délégation : Direction seulement. Elle
 * délègue à Propriétaire ou Administration seulement (jamais Employé/Magasinier). */
export function canGrantDelegation(persona) {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/** Est-ce que `persona` agit actuellement avec les pouvoirs de Direction pour `category`? */
export function delegationActive(settings, persona, category, today = new Date()) {
  const delegation = settings?.delegation;
  if (!delegation || delegation.delegatePersona !== persona) return false;
  if (![ROLES.BOSS, ROLES.ADMIN].includes(delegation.delegatePersona)) return false; // seuls boss/admin sont délégables
  const start = new Date(`${delegation.start}T00:00:00`);
  const end = new Date(`${delegation.end}T23:59:59`);
  if (!(today >= start && today <= end)) return false;
  return !category || (delegation.permissions || []).includes(category);
}

/** Direction elle-même, ou quelqu'un agissant comme Direction via délégation active pour `category`. */
function actsAsDirection(settings, persona, category) {
  assertRole(persona);
  return persona === ROLES.OWNER || delegationActive(settings, persona, category);
}

// ---------------------------------------------------------------------------
// Principe général — visibilité financière
// Confirmé : Employé et Magasinier ne voient JAMAIS de taux, montant ou
// valeur monétaire, nulle part dans l'application. Règle transversale à
// vérifier dans chaque vue, pas seulement les achats.
// ---------------------------------------------------------------------------

export function canSeeFinancialValues(persona) {
  assertRole(persona);
  return ![ROLES.MEMBER, ROLES.WAREHOUSE].includes(persona);
}

// ---------------------------------------------------------------------------
// Achats — deux mécanismes distincts (confirmé, ce n'était pas une
// contradiction : deux chemins séparés avec des règles différentes)
// ---------------------------------------------------------------------------

/** Achats affectés directement à un projet : jamais de double autorisation du Propriétaire, peu importe le montant. */
export function canEnterProjectPurchase(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.ADMIN].includes(persona);
}
export function canApproveProjectPurchase(settings, persona) {
  return actsAsDirection(settings, persona, "purchases");
}

/** Demandes d'achat : seuil monétaire par catégorie, au-delà duquel le Propriétaire doit aussi approuver. */
export function canApprovePurchaseRequest(settings, persona, request, thresholdsByCategory = {}) {
  assertRole(persona);
  const threshold = thresholdsByCategory[request?.category];
  const overThreshold = Number.isFinite(threshold) && Number(request?.amount || 0) > threshold;
  if (overThreshold) return persona === ROLES.BOSS;
  return actsAsDirection(settings, persona, "purchases");
}
/** Un achat rejeté par le Propriétaire est final — jamais de re-soumission. */
export function canResubmitRejectedPurchase() {
  return false;
}
export function canViewPurchase(persona, purchase, currentEmployeeId) {
  assertRole(persona);
  if ([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS].includes(persona)) return true;
  return purchase?.requester === currentEmployeeId;
}

// ---------------------------------------------------------------------------
// Appels de service
// ---------------------------------------------------------------------------

/** Le technicien (Employé) ne voit jamais de prix, même après signature client. */
/** Confirmé pour Direction, Administration et Propriétaire. */
export function canSeeServicePricing(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS].includes(persona);
}
export function canPriceServiceParts(persona) {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
export function canReassignServiceCall(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.ADMIN].includes(persona);
}
/** Le Magasinier n'a aucun rôle dans les appels de service. */
export function canAccessServiceCalls(persona) {
  assertRole(persona);
  return persona !== ROLES.WAREHOUSE;
}

// ---------------------------------------------------------------------------
// Budgétaire
// ---------------------------------------------------------------------------

/**
 * Création à partir d'une demande client : Direction et Propriétaire
 * peuvent tous les deux créer, sans condition. La « transmission » par la
 * Direction est un mécanisme séparé (fait apparaître la demande dans le
 * centre d'actions du Propriétaire) — une question de visibilité/workflow,
 * pas une porte de permission. Volontairement hors de ce module : à
 * modéliser dans le futur module des demandes/notifications.
 */
export function canCreateBudgetFromRequest(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.BOSS].includes(persona);
}
/** Modification avant envoi au client : Direction seulement, jamais Administration. */
export function canModifyBudget(persona) {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
/** Marquer prêt / approuver pour envoi : Propriétaire et Direction. */
export function canApproveBudgetForSending(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.BOSS].includes(persona);
}
export function canAccessBudget(persona) {
  assertRole(persona);
  return ![ROLES.MEMBER, ROLES.WAREHOUSE].includes(persona);
}

// ---------------------------------------------------------------------------
// Punchs et temps
// ---------------------------------------------------------------------------

export function canApprovePunch(settings, persona) {
  return actsAsDirection(settings, persona, "hours");
}
/** L'employé peut corriger son propre punch après soumission, avant approbation. */
export function canEditOwnPunch(persona, punch, currentEmployeeId) {
  assertRole(persona);
  return punch?.employee === currentEmployeeId && punch?.status !== "approved";
}

// ---------------------------------------------------------------------------
// Livraisons et roulements
// ---------------------------------------------------------------------------

/** Marquer la production complétée : Direction seulement (le Propriétaire
 * ne s'occupe pas de ça — confirmé, la présence du Propriétaire dans le
 * code pour l'étape suivante était un oubli). */
export function canMarkProductionComplete(persona) {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
/** Choisir le mode de sortie (Bon de livraison, tiers, ramassage,
 * installation) une fois la production complétée : Direction et
 * Administration. */
export function canChooseFulfillmentMode(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.ADMIN].includes(persona);
}
/** Création d'un roulement directement, sans passer par une demande client. */
export function canCreateRollingDirectly(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.BOSS].includes(persona);
}
/** Création d'un projet directement, sans passer par un budgétaire. */
export function canCreateProjectDirectly(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.BOSS].includes(persona);
}

// ---------------------------------------------------------------------------
// Paramètres et facturation
// ---------------------------------------------------------------------------

/** Direction seulement, sans exception — verrouillé au niveau navigation dans la v19 depuis la v0.8. */
export function canAccessSettings(persona) {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
export function canModifyEmployeeRate(persona) {
  return canAccessSettings(persona); // seul chemin d'écriture trouvé dans la v19 — même porte
}
// ---------------------------------------------------------------------------
// Facturation
// Confirmé : Sage reste la source réelle de la facture; GSC Pilot en garde
// le suivi manuel — permanent, pas d'intégration prévue pour ne pas
// alourdir l'application. Direction et Administration peuvent toutes les
// deux créer une facture et enregistrer un paiement (reflète la pratique
// réelle de l'équipe); seul le Propriétaire en est exclu. Demander la
// facturation d'un jalon (vers le centre d'actions d'Administration)
// reste Direction seulement.
// ---------------------------------------------------------------------------
export function canModifyBillingCycle(persona) {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
/** Demander la facturation d'un jalon (fait apparaître la demande dans le
 * centre d'actions d'Administration) : Direction seulement. */
export function canRequestInvoice(persona) {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
/** Créer/enregistrer l'entrée de facture (directement, ou en traitant une
 * demande) : Direction et Administration toutes les deux — reflète la
 * façon dont l'équipe travaille en pratique, pas une restriction stricte. */
export function canCreateInvoiceRecord(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.ADMIN].includes(persona);
}
export function canRecordPayment(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.ADMIN].includes(persona);
}
/** Raisons typiques : litige, attente d'un changement. */
export function canHoldInvoice(persona) {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Tableau de bord / Rapports / Contacts
// ---------------------------------------------------------------------------

export function canAccessOverviewViews(persona) {
  assertRole(persona);
  return [ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS].includes(persona);
}
