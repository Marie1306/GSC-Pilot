/**
 * GSC Pilot — Rôles et permissions
 *
 * Pourquoi ce module existe : dans le prototype v19, 252 vérifications de
 * rôle sont éparpillées dans 16 vues, chacune écrite à la main, à même le
 * HTML généré. Ici, chaque règle confirmée n'existe qu'à un seul endroit,
 * sous un seul nom — tout futur module importe ces fonctions plutôt que de
 * réécrire ses propres `persona === "..."`.
 *
 * Chaque règle ci-dessous est sourcée dans GSC_Pilot_Specification_confirmee.md
 * (confirmée le 7-8 août 2026) — rien n'est deviné.
 *
 * Porté depuis docs/handoff/03-modules-v01/roles.js — typage ajouté
 * uniquement, aucune ligne de logique changée (voir CLAUDE.md).
 *
 * ⚠️ Piège de nommage, gardé tel quel volontairement : "owner" = Direction,
 * "boss" = Propriétaire (le vrai propriétaire de l'entreprise). Ne jamais
 * assumer que persona === ROLES.OWNER signifie "le propriétaire".
 */

export const ROLES = Object.freeze({
  OWNER: "owner", // Direction
  ADMIN: "admin", // Administration
  BOSS: "boss", // Propriétaire
  MEMBER: "member", // Employé
  WAREHOUSE: "warehouse", // Magasinier
} as const);

export type Persona = (typeof ROLES)[keyof typeof ROLES];

const ALL_ROLES: Persona[] = Object.values(ROLES);

function assertRole(persona: Persona): void {
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

export const DELEGATION_CATEGORIES = Object.freeze(["hours", "purchases", "service", "changes"] as const);
export type DelegationCategory = (typeof DELEGATION_CATEGORIES)[number];

export interface DelegationInfo {
  delegatePersona: Persona;
  start: string;
  end: string;
  permissions?: DelegationCategory[];
  monetaryLimit?: number | null;
  justification?: string;
}

export interface DelegationSettings {
  delegation?: DelegationInfo | null;
}

/** Qui peut mettre en place une délégation : Direction seulement. Elle
 * délègue à Propriétaire ou Administration seulement (jamais Employé/Magasinier). */
export function canGrantDelegation(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/** Est-ce que `persona` agit actuellement avec les pouvoirs de Direction pour `category`? */
export function delegationActive(
  settings: DelegationSettings | null | undefined,
  persona: Persona,
  category?: DelegationCategory | string,
  today: Date = new Date(),
): boolean {
  const delegation = settings?.delegation;
  if (!delegation || delegation.delegatePersona !== persona) return false;
  if (!([ROLES.BOSS, ROLES.ADMIN] as Persona[]).includes(delegation.delegatePersona)) return false; // seuls boss/admin sont délégables
  const start = new Date(`${delegation.start}T00:00:00`);
  const end = new Date(`${delegation.end}T23:59:59`);
  if (!(today >= start && today <= end)) return false;
  return !category || (delegation.permissions || []).includes(category as DelegationCategory);
}

/** Direction elle-même, ou quelqu'un agissant comme Direction via délégation active pour `category`. */
function actsAsDirection(
  settings: DelegationSettings | null | undefined,
  persona: Persona,
  category?: DelegationCategory,
): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER || delegationActive(settings, persona, category);
}

// ---------------------------------------------------------------------------
// Principe général — visibilité financière
// Confirmé : Employé et Magasinier ne voient JAMAIS de taux, montant ou
// valeur monétaire, nulle part dans l'application. Règle transversale à
// vérifier dans chaque vue, pas seulement les achats.
// ---------------------------------------------------------------------------

export function canSeeFinancialValues(persona: Persona): boolean {
  assertRole(persona);
  return !([ROLES.MEMBER, ROLES.WAREHOUSE] as Persona[]).includes(persona);
}

// ---------------------------------------------------------------------------
// Achats — deux mécanismes distincts (confirmé, ce n'était pas une
// contradiction : deux chemins séparés avec des règles différentes)
// ---------------------------------------------------------------------------

/** Achats affectés directement à un projet : jamais de double autorisation du Propriétaire, peu importe le montant. */
export function canEnterProjectPurchase(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN] as Persona[]).includes(persona);
}
export function canApproveProjectPurchase(settings: DelegationSettings | null | undefined, persona: Persona): boolean {
  return actsAsDirection(settings, persona, "purchases");
}

/** Demandes d'achat : seuil monétaire par catégorie, au-delà duquel le Propriétaire doit aussi approuver. */
export interface PurchaseRequestLike {
  category?: string;
  amount?: number;
  /**
   * Rôle de la personne qui a soumis la demande — champ AJOUTÉ le 13 août
   * 2026 (règle confirmée directement avec l'utilisatrice, absente du
   * roles.js d'origine) : une demande soumise par Administration,
   * Propriétaire ou Direction n'entraîne JAMAIS de double autorisation du
   * Propriétaire, peu importe le montant — Direction seule approuve.
   * Optionnel et rétrocompatible : un appelant qui ne le fournit pas
   * retombe exactement sur le comportement d'origine (seuil basé
   * uniquement sur catégorie/montant, voir les tests "Demandes d'achat
   * (seuil par catégorie)", inchangés).
   */
  requesterPersona?: Persona;
}

/**
 * Construit la carte de seuils à passer à canApprovePurchaseRequest à
 * partir du seuil GELÉ sur une demande (jamais relu en direct depuis
 * PurchaseCategory — confirmé le 12 août 2026, un changement de seuil ne
 * s'applique jamais rétroactivement à une demande déjà en attente).
 * Partagée entre apps/api (autorité réelle) et apps/web (même affichage
 * que le serveur, jamais une approximation séparée) — ajoutée ici le 13
 * août 2026 précisément pour ne pas la dupliquer entre les deux.
 */
export function buildFrozenPurchaseThresholdsMap(request: {
  category?: string | null;
  thresholdAmountAtSubmission?: number | null;
}): Record<string, number> {
  if (!request.category || request.thresholdAmountAtSubmission === null || request.thresholdAmountAtSubmission === undefined) {
    return {};
  }
  return { [request.category]: request.thresholdAmountAtSubmission };
}

export function canApprovePurchaseRequest(
  settings: DelegationSettings | null | undefined,
  persona: Persona,
  request: PurchaseRequestLike,
  thresholdsByCategory: Record<string, number> = {},
): boolean {
  assertRole(persona);
  const requesterExempt =
    request.requesterPersona !== undefined && ([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS] as Persona[]).includes(request.requesterPersona);
  if (!requesterExempt) {
    const category = request?.category;
    const threshold = category !== undefined ? thresholdsByCategory[category] : undefined;
    const overThreshold = Number.isFinite(threshold) && Number(request?.amount || 0) > (threshold as number);
    if (overThreshold) return persona === ROLES.BOSS;
  }
  return actsAsDirection(settings, persona, "purchases");
}
/**
 * Suivi de commande (en attente/commandé/reçu) et application au projet —
 * confirmé le 13 août 2026, réutilise la même porte que l'approbation
 * normale (Direction, ou délégué "purchases"). Jamais le Propriétaire seul
 * via l'escalade de seuil : cette étape suit toujours l'autorisation, pas
 * le mécanisme de double autorisation.
 */
export function canManagePurchaseFulfillment(settings: DelegationSettings | null | undefined, persona: Persona): boolean {
  return actsAsDirection(settings, persona, "purchases");
}
/** Un achat rejeté par le Propriétaire est final — jamais de re-soumission. */
export function canResubmitRejectedPurchase(): boolean {
  return false;
}

/**
 * Soumettre une demande d'achat — formulaire général (avec catégorie) OU
 * liste rapide de projet (sans catégorie). Ouvert à TOUS les rôles.
 *
 * Historique : jusqu'au 12 août 2026, seuls Propriétaire et Direction
 * pouvaient soumettre la liste rapide — restriction volontaire, puisque
 * l'absence de catégorie sur ses lignes retire le seuil de double
 * autorisation (voir canApprovePurchaseRequest ci-dessus), et n'importe
 * qui aurait pu s'en servir pour contourner ce seuil. Le 13 août 2026,
 * l'utilisatrice a confirmé EXPLICITEMENT vouloir ouvrir la liste rapide à
 * tous les rôles malgré ce risque signalé (Employé/Magasinier peuvent donc
 * bel et bien soumettre une ligne sans catégorie, sans jamais déclencher le
 * seuil) — plus rien ne distingue la porte d'entrée des deux mécanismes,
 * une seule fonction suffit désormais pour les deux.
 */
export function canSubmitPurchaseRequest(persona: Persona): boolean {
  assertRole(persona);
  return true;
}
export interface PurchaseLike {
  requester?: string;
}
export function canViewPurchase(persona: Persona, purchase: PurchaseLike, currentEmployeeId: string): boolean {
  assertRole(persona);
  if (([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS] as Persona[]).includes(persona)) return true;
  return purchase?.requester === currentEmployeeId;
}

// ---------------------------------------------------------------------------
// Appels de service
// ---------------------------------------------------------------------------

/** Le technicien (Employé) ne voit jamais de prix, même après signature client. */
/** Confirmé pour Direction, Administration et Propriétaire. */
export function canSeeServicePricing(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS] as Persona[]).includes(persona);
}
export function canPriceServiceParts(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
export function canReassignServiceCall(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN] as Persona[]).includes(persona);
}
/** Le Magasinier n'a aucun rôle dans les appels de service. */
export function canAccessServiceCalls(persona: Persona): boolean {
  assertRole(persona);
  return persona !== ROLES.WAREHOUSE;
}
/**
 * Approuver un call de service (résumé + signature déjà requis avant) et
 * l'envoyer à l'administration pour facturation — les deux touchent la
 * file de facturation, même porte que canRequestInvoice (écart trouvé et
 * corrigé le 9 août 2026 : ces deux actions n'avaient aucune vérification
 * de rôle dans la v19 vérifiée).
 */
export function canApproveServiceCall(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
export function canSendServiceCallToAdmin(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/** Supprimer un appel de service (corbeille) : Direction seulement — même palier que canDeleteBudget/canDeleteProject/canDeleteClientRequest (19 août 2026). */
export function canDeleteServiceCall(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Budgétaire
// ---------------------------------------------------------------------------

/**
 * Création à partir d'une demande client, directement, ou en option à la
 * création d'un projet/roulement : Direction et Propriétaire peuvent tous
 * les deux créer, sans condition, peu importe le chemin d'entrée. La
 * « transmission » par la Direction est un mécanisme séparé (fait
 * apparaître la demande dans le centre d'actions du Propriétaire) — une
 * question de visibilité/workflow, pas une porte de permission.
 * Volontairement hors de ce module : à modéliser dans le futur module des
 * demandes/notifications.
 */
export function canCreateBudgetFromRequest(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.BOSS] as Persona[]).includes(persona);
}
/** Modification avant envoi au client : Direction seulement, jamais Administration. */
export function canModifyBudget(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
/**
 * Modification d'une ligne de type Achat marquée "Direction ET Propriétaire"
 * (vérifié dans le prototype v19, 12 août 2026 — varie PAR LIGNE, pas
 * seulement par catégorie). Plus large que canModifyBudget : ne remplace pas
 * la porte Direction seulement des lignes Heures / lignes Achat marquées
 * "Direction seulement" / complexité / back-up / méta — voir la logique par
 * ligne dans budgets/service.ts.
 */
export function canModifyBudgetPurchaseLine(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.BOSS] as Persona[]).includes(persona);
}
/** Marquer prêt / approuver pour envoi : Propriétaire et Direction. */
export function canApproveBudgetForSending(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.BOSS] as Persona[]).includes(persona);
}
export function canAccessBudget(persona: Persona): boolean {
  assertRole(persona);
  return !([ROLES.MEMBER, ROLES.WAREHOUSE] as Persona[]).includes(persona);
}

/**
 * Convertir un budgétaire « Contrat obtenu » en projet : Direction
 * seulement — distinct de la création DIRECTE d'un projet (Direction ET
 * Propriétaire, voir canCreateProjectDirectly plus bas), confirmé le
 * 12 août 2026.
 */
export function canConvertBudgetToProject(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/** Même palier que canConvertBudgetToProject (module Roulements, 20 août 2026) — distinct de canCreateRollingDirectly (Direction ET Propriétaire). */
export function canConvertBudgetToRolling(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/** Supprimer un budgétaire (corbeille) : Direction seulement — même palier que canDeleteProject/canDeleteClientRequest (18 août 2026). */
export function canDeleteBudget(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/** Réinitialiser le contenu d'un budgétaire (recommencer) : Direction seulement, même palier que canModifyBudget (18 août 2026). */
export function canResetBudget(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/** Voir le détail financier d'un projet — mêmes rôles que le budgétaire (Employé/Magasinier jamais). */
export function canAccessProject(persona: Persona): boolean {
  assertRole(persona);
  return !([ROLES.MEMBER, ROLES.WAREHOUSE] as Persona[]).includes(persona);
}

/**
 * Marquer envoyé, Contrat obtenu, ou Refusé : Direction seulement, le
 * Propriétaire n'y est pas impliqué — spec confirmée (« Suivi budgétaire »)
 * pour envoyé/Contrat obtenu, étendue à Refusé le 12 août 2026 (même
 * catégorie d'action : enregistrer le résultat d'une soumission envoyée).
 */
export function canRecordBudgetOutcome(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Punchs et temps
// ---------------------------------------------------------------------------

export function canApprovePunch(settings: DelegationSettings | null | undefined, persona: Persona): boolean {
  return actsAsDirection(settings, persona, "hours");
}
export interface PunchLike {
  employee?: string;
  status?: string;
}
/** L'employé peut corriger son propre punch après soumission, avant approbation. */
export function canEditOwnPunch(persona: Persona, punch: PunchLike, currentEmployeeId: string): boolean {
  assertRole(persona);
  return punch?.employee === currentEmployeeId && punch?.status !== "approved";
}

export interface ServiceCallAssignmentLike {
  assignedEmployees?: { id: string }[];
}
/**
 * Restriction reprise du prototype v19 (jamais contredite par la
 * spécification confirmée) : un Employé ne peut puncher que sur un call de
 * service qui lui est assigné. Les autres rôles (Direction, Administration,
 * Propriétaire) ne sont pas limités de cette façon. Plusieurs employés
 * peuvent être assignés au même call (confirmé le 19 août 2026 — « ils
 * doivent parfois y aller à deux techniciens »). Magasinier n'a aucun rôle
 * dans les appels de service (canAccessServiceCalls) — jamais autorisé ici
 * non plus, assigné ou non (écart trouvé en vérifiant contre la base réelle).
 */
export function canPunchServiceCall(persona: Persona, call: ServiceCallAssignmentLike, employeeId: string): boolean {
  assertRole(persona);
  if (persona === ROLES.WAREHOUSE) return false;
  if (persona !== ROLES.MEMBER) return true;
  return (call?.assignedEmployees ?? []).some((employee) => employee.id === employeeId);
}

/** Puncher pour un autre employé (backfill) — même patron que la création de demande/call. */
export function canPunchForOtherEmployee(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS] as Persona[]).includes(persona);
}

/** Supprimer une entrée de temps (corbeille) : Direction seulement — même palier que canDeleteServiceCall/canDeleteBudget/canDeleteProject (20 août 2026). */
export function canDeleteTimeEntry(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Livraisons et roulements
// ---------------------------------------------------------------------------

/** Marquer la production complétée : Direction seulement (le Propriétaire
 * ne s'occupe pas de ça — confirmé, la présence du Propriétaire dans le
 * code pour l'étape suivante était un oubli). */
export function canMarkProductionComplete(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
/** Choisir le mode de sortie (Bon de livraison, tiers, ramassage,
 * installation) une fois la production complétée : Direction et
 * Administration. */
export function canChooseFulfillmentMode(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN] as Persona[]).includes(persona);
}
/**
 * Voir et confirmer une livraison (module Livraisons, 20 août 2026) : toute
 * l'équipe sauf Employé — le Magasinier livre en main propre (mode Bon de
 * livraison) donc doit voir et confirmer ses livraisons assignées;
 * Direction/Administration/Propriétaire gardent la vue d'ensemble. Reprend
 * exactement le helper "provisoire" notMemberOnly de nav.ts (voir ce
 * fichier) — promu ici maintenant que le module est réellement construit.
 */
export function canAccessDeliveries(persona: Persona): boolean {
  assertRole(persona);
  return persona !== ROLES.MEMBER;
}
/** Création d'un roulement directement, sans passer par une demande client. */
export function canCreateRollingDirectly(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.BOSS] as Persona[]).includes(persona);
}
/** Création d'un projet directement, sans passer par un budgétaire. */
export function canCreateProjectDirectly(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.BOSS] as Persona[]).includes(persona);
}

// ---------------------------------------------------------------------------
// Paramètres et facturation
// ---------------------------------------------------------------------------

/** Direction seulement, sans exception — verrouillé au niveau navigation dans la v19 depuis la v0.8. */
export function canAccessSettings(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
export function canModifyEmployeeRate(persona: Persona): boolean {
  return canAccessSettings(persona); // seul chemin d'écriture trouvé dans la v19 — même porte
}
// ---------------------------------------------------------------------------
// Facturation
// Confirmé : Sage reste la source réelle de la facture; GSC Pilot en garde
// le suivi manuel — permanent, pas d'intégration prévue pour ne pas
// alourdir l'application. Direction et Administration peuvent toutes les
// deux créer une facture et enregistrer un paiement (reflète la pratique
// réelle de l'équipe); le Propriétaire en est exclu pour TOUTE action
// (créer/enregistrer un paiement/mettre en suspens/demander). Demander la
// facturation d'un jalon (vers le centre d'actions d'Administration)
// reste Direction seulement. Le Propriétaire a accès en CONSULTATION
// seulement au module consolidé (canViewInvoicing, demande explicite de
// l'utilisatrice le 31 août 2026) — distinct des permissions d'action
// ci-dessous, qui restent inchangées.
// ---------------------------------------------------------------------------
/** Voir le module Facturation (vue consolidée) : Direction, Administration
 * et Propriétaire — mais le Propriétaire n'y a aucune action (voir les
 * fonctions ci-dessous, toutes encore Direction/Administration seulement). */
export function canViewInvoicing(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS] as Persona[]).includes(persona);
}
export function canModifyBillingCycle(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
/** Demander la facturation d'un jalon (fait apparaître la demande dans le
 * centre d'actions d'Administration) : Direction seulement. */
export function canRequestInvoice(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
/** Créer/enregistrer l'entrée de facture (directement, ou en traitant une
 * demande) : Direction et Administration toutes les deux — reflète la
 * façon dont l'équipe travaille en pratique, pas une restriction stricte. */
export function canCreateInvoiceRecord(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN] as Persona[]).includes(persona);
}
export function canRecordPayment(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN] as Persona[]).includes(persona);
}
/** Raisons typiques : litige, attente d'un changement. */
export function canHoldInvoice(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Garantie
// ---------------------------------------------------------------------------

/** Activer/modifier la garantie (case "prévue", date de fin, historique) :
 * Direction seulement — n'importe quand, aucun préalable de production/
 * sortie (confirmé le 17 août 2026). */
export function canManageWarranty(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Menu Options du projet
// ---------------------------------------------------------------------------

/** Modifier les informations courantes (nom, échéance) : Direction et
 * Administration — même palier que les autres actions de gestion courante
 * du projet (fulfillment, facturation). */
export function canManageProject(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN] as Persona[]).includes(persona);
}

/** Archiver/désarchiver, supprimer (corbeille) : Direction seulement — la
 * capture d'écran du menu Options les regroupe elle-même sous "Actions
 * sensibles", même palier que les autres actions les plus sensibles du
 * projet (marquer la production complétée, demander la facturation). */
export function canArchiveProject(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
export function canDeleteProject(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Menu Options du roulement (28 août 2026) — même structure que le menu
// Options du projet ci-dessus, fonctions séparées (pas de réutilisation
// directe des canXProject) même quand le corps est identique, comme partout
// ailleurs dans ce fichier pour les paliers de suppression/archivage.
// ---------------------------------------------------------------------------

/** Modifier les informations courantes (contact du roulement) — même palier que canManageProject. */
export function canManageRolling(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN] as Persona[]).includes(persona);
}

/** Archiver/désarchiver, supprimer (corbeille) : Direction seulement — même palier que canArchiveProject/canDeleteProject. */
export function canArchiveRolling(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
export function canDeleteRolling(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Post-mortem
// ---------------------------------------------------------------------------

/** Écrire l'« Analyse finale » du Post-mortem (dépassements, améliorations,
 * recommandation) : Direction seulement — n'importe quand, aucun préalable
 * de fermeture (confirmé le 17 août 2026). Le reste de l'écran (chiffres
 * déjà calculés) suit canAccessProject/canSeeFinancialValues, comme
 * partout ailleurs dans le module Projet. */
export function canManagePostMortem(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Tableau de bord / Rapports / Contacts / Demandes clients / Appels de service
// Confirmé : tout le monde sauf Employé et Magasinier peut créer une
// demande client ou un appel de service (cohérent avec la règle de
// visibilité financière — aucune fonction dédiée n'existait dans la v19,
// règle confirmée directement avec l'utilisateur).
// ---------------------------------------------------------------------------

export function canAccessOverviewViews(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS] as Persona[]).includes(persona);
}

/**
 * Centre d'actions — page accessible à TOUS les rôles (29 août 2026, demande
 * de l'utilisatrice pour la catégorie « Notes reçues », accessible à tout le
 * monde). Distincte de canAccessOverviewViews : les 8 autres catégories du
 * Centre d'actions restent chacune filtrées par leur propre permission
 * d'origine (voir actionCenter/service.ts) — Employé/Magasinier ouvrent donc
 * la page mais n'y voient jamais ces catégories, seulement leurs notes.
 */
export function canAccessActionCenter(persona: Persona): boolean {
  assertRole(persona);
  return true;
}

/** Créer une demande client : Direction, Administration, Propriétaire — jamais Employé/Magasinier. */
export function canCreateClientRequest(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS] as Persona[]).includes(persona);
}

/** Créer un appel de service : mêmes rôles que la création d'une demande client. */
export function canCreateServiceCall(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS] as Persona[]).includes(persona);
}

/** Voir la liste/le détail des demandes clients : mêmes rôles que la création — confirmé le 12 août 2026. */
export function canViewClientRequests(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS] as Persona[]).includes(persona);
}

/** Ajouter une note ou changer le statut d'une demande client : mêmes rôles que la création. */
export function canManageClientRequest(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS] as Persona[]).includes(persona);
}

/** Supprimer une demande client (corbeille) : Direction seulement — même palier que canDeleteProject (18 août 2026). */
export function canDeleteClientRequest(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Sous-assemblages / Avenants / Gantt (21 août 2026) — voir subassembly.ts,
// amendments.ts.
// ---------------------------------------------------------------------------

/**
 * Déclarer un sous-assemblage prêt : Propriétaire SEULEMENT — corrigé le
 * 21 août 2026, signalé par l'utilisatrice ("sous-assemblage toujours
 * Marc (propriétaire)"). Confirmé directement dans la spec (ligne 639,
 * section Achats liste rapide) : « le Propriétaire (Marc, aussi le seul
 * designer/conception) ». Pas "tout employé" comme deviné au premier jet —
 * un seul designer, un seul rôle, jamais Direction/Administration/Employé/
 * Magasinier.
 */
export function canDeclareSubassembly(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.BOSS;
}

/** Créer la liste de pièces d'un sous-assemblage : Direction seulement (spec confirmée). */
export function canPrepareSubassemblyPartsList(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/** Déclarer l'assemblage prêt à commencer : Direction seulement (spec confirmée) — même geste explicite que Marc pour la conception. */
export function canDeclareAssemblyReady(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/** Créer un avenant : Direction seulement (spec confirmée, vérifié le 9 août 2026 — "déjà correct"). */
export function canCreateAmendment(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/**
 * Éditer le Gantt de production (affectations d'employés, dépendances,
 * dérogations de compétence, marquer une tâche complétée) : Direction
 * seulement — spec confirmée et corrigée le 9 août 2026 (Administration et
 * Propriétaire n'ont qu'un accès visuel, voir canAccessOverviewViews pour
 * la vue elle-même).
 */
export function canEditGanttSchedule(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

// ---------------------------------------------------------------------------
// Checklist de production (21 août 2026) — module indépendant de
// Sous-assemblages (confirmé par l'utilisatrice). Suit les pièces
// fabriquées à l'interne, pas les pièces achetées.
// ---------------------------------------------------------------------------

/** Créer une checklist et y ajouter des pièces/achats : Direction seulement (spec confirmée). */
export function canManageProductionChecklist(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}

/**
 * Voir les checklists actives et cocher une étape complétée : tout le
 * monde SAUF Magasinier (spec confirmée — "tous sauf Magasinier", le
 * Magasinier n'a pas de travail d'atelier de fabrication).
 */
export function canAccessProductionChecklist(persona: Persona): boolean {
  assertRole(persona);
  return persona !== ROLES.WAREHOUSE;
}

// ---------------------------------------------------------------------------
// Rapport d'erreurs (28 août 2026, nouveau module) — un seul palier pour
// tout le module (voir/créer/le filtrer), confirmé explicitement par
// l'utilisatrice : « Accessible par propriétaire et Direction seulement »,
// contrairement à d'autres modules où voir et créer ont des paliers
// différents (ex. Roulements : Administration voit, seuls Direction/
// Propriétaire créent) — ici il n'y a qu'un seul groupe nommé, une seule
// fonction suffit.
// ---------------------------------------------------------------------------

/** Module Rapport d'erreurs (voir/créer/filtrer) : Propriétaire et Direction seulement. */
export function canAccessErrorReports(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.OWNER, ROLES.BOSS] as Persona[]).includes(persona);
}

/** Qui peut être visé par un rapport d'erreur : Employé et Magasinier seulement (rôles de production, confirmé). */
export function canBeErrorReportSubject(persona: Persona): boolean {
  assertRole(persona);
  return ([ROLES.MEMBER, ROLES.WAREHOUSE] as Persona[]).includes(persona);
}

/** Supprimer un rapport d'erreur (corbeille) : Direction seulement — même palier que canDeleteServiceCall/canDeleteBudget/canDeleteProject/canDeleteClientRequest/canDeleteTimeEntry/canDeleteRolling. */
export function canDeleteErrorReport(persona: Persona): boolean {
  assertRole(persona);
  return persona === ROLES.OWNER;
}
