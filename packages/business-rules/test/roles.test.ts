// Porté 1-pour-1 depuis docs/handoff/03-modules-v01/roles.test.js (60 assertions).
// Un scénario par règle confirmée dans GSC_Pilot_Specification_confirmee.md.
import { describe, it, expect } from "vitest";
import * as P from "../src/roles.js";

const { OWNER, ADMIN, BOSS, MEMBER, WAREHOUSE } = P.ROLES;

describe("Visibilité financière (principe général)", () => {
  it("Direction voit les valeurs", () => {
    expect(P.canSeeFinancialValues(OWNER)).toBe(true);
  });
  it("Employé ne voit jamais de valeurs", () => {
    expect(P.canSeeFinancialValues(MEMBER)).toBe(false);
  });
  it("Magasinier ne voit jamais de valeurs", () => {
    expect(P.canSeeFinancialValues(WAREHOUSE)).toBe(false);
  });
});

describe("Achats directs de projet (jamais de seuil)", () => {
  it("Administration peut saisir", () => {
    expect(P.canEnterProjectPurchase(ADMIN)).toBe(true);
  });
  it("Employé ne peut pas saisir", () => {
    expect(P.canEnterProjectPurchase(MEMBER)).toBe(false);
  });
  it("Direction approuve peu importe le montant", () => {
    expect(P.canApproveProjectPurchase({}, OWNER)).toBe(true);
  });
  it("Administration ne peut jamais approuver elle-même", () => {
    expect(P.canApproveProjectPurchase({}, ADMIN)).toBe(false);
  });
});

describe("Demandes d'achat (seuil par catégorie)", () => {
  const thresholds = { fabrication: 5000 };
  it("Sous le seuil : Direction approuve", () => {
    expect(P.canApprovePurchaseRequest({}, OWNER, { category: "fabrication", amount: 1000 }, thresholds)).toBe(true);
  });
  it("Sous le seuil : Propriétaire ne peut pas (pas nécessaire)", () => {
    expect(P.canApprovePurchaseRequest({}, BOSS, { category: "fabrication", amount: 1000 }, thresholds)).toBe(false);
  });
  it("Au-dessus du seuil : seul le Propriétaire approuve", () => {
    expect(P.canApprovePurchaseRequest({}, BOSS, { category: "fabrication", amount: 9000 }, thresholds)).toBe(true);
  });
  it("Au-dessus du seuil : Direction seule ne suffit plus", () => {
    expect(P.canApprovePurchaseRequest({}, OWNER, { category: "fabrication", amount: 9000 }, thresholds)).toBe(false);
  });
  it("Achat rejeté par le Propriétaire : jamais re-soumis", () => {
    expect(P.canResubmitRejectedPurchase()).toBe(false);
  });
  it("Employé voit son propre achat", () => {
    expect(P.canViewPurchase(MEMBER, { requester: "emp-1" }, "emp-1")).toBe(true);
  });
  it("Employé ne voit pas l'achat d'un autre", () => {
    expect(P.canViewPurchase(MEMBER, { requester: "emp-2" }, "emp-1")).toBe(false);
  });
});

describe("Délégation", () => {
  it("Seule la Direction peut mettre en place une délégation", () => {
    expect(P.canGrantDelegation(OWNER)).toBe(true);
  });
  it("Le Propriétaire ne peut pas configurer sa propre délégation", () => {
    expect(P.canGrantDelegation(BOSS)).toBe(false);
  });
  it("Administration ne peut pas configurer une délégation", () => {
    expect(P.canGrantDelegation(ADMIN)).toBe(false);
  });

  const activeDelegation = {
    delegation: { delegatePersona: BOSS, start: "2026-08-01", end: "2026-08-31", permissions: ["purchases", "hours"] as P.DelegationCategory[] },
  };
  const today = new Date("2026-08-15T12:00:00");

  it("Délégué actif peut approuver un achat direct pendant la période", () => {
    expect(P.canApproveProjectPurchase(activeDelegation, BOSS)).toBe(true);
  });
  it("Délégation hors période = inactive", () => {
    expect(P.delegationActive(activeDelegation, BOSS, "purchases", new Date("2026-09-15"))).toBe(false);
  });
  it("Délégation sur catégorie non cochée = inactive", () => {
    expect(P.delegationActive(activeDelegation, BOSS, "service", today)).toBe(false);
  });
  it("Administration non désignée ne peut pas agir comme Direction", () => {
    expect(P.canApproveProjectPurchase(activeDelegation, ADMIN)).toBe(false);
  });
});

describe("Appels de service", () => {
  it("Direction voit les prix", () => {
    expect(P.canSeeServicePricing(OWNER)).toBe(true);
  });
  it("Propriétaire voit aussi les prix", () => {
    expect(P.canSeeServicePricing(BOSS)).toBe(true);
  });
  it("Technicien ne voit jamais de prix", () => {
    expect(P.canSeeServicePricing(MEMBER)).toBe(false);
  });
  it("Seule la Direction fixe le prix des pièces", () => {
    expect(P.canPriceServiceParts(OWNER)).toBe(true);
  });
  it("Administration ne peut pas fixer le prix des pièces", () => {
    expect(P.canPriceServiceParts(ADMIN)).toBe(false);
  });
  it("Magasinier hors de la portée des appels de service", () => {
    expect(P.canAccessServiceCalls(WAREHOUSE)).toBe(false);
  });
});

describe("Budgétaire", () => {
  it("Direction crée toujours", () => {
    expect(P.canCreateBudgetFromRequest(OWNER)).toBe(true);
  });
  it("Propriétaire crée aussi, sans condition de transmission", () => {
    expect(P.canCreateBudgetFromRequest(BOSS)).toBe(true);
  });
  it("Administration ne crée jamais de budgétaire", () => {
    expect(P.canCreateBudgetFromRequest(ADMIN)).toBe(false);
  });
  it("Administration ne modifie jamais un budgétaire", () => {
    expect(P.canModifyBudget(ADMIN)).toBe(false);
  });
  it("Employé n'accède jamais au budgétaire", () => {
    expect(P.canAccessBudget(MEMBER)).toBe(false);
  });
  it("Seule la Direction enregistre le résultat d'une soumission (envoyé/Contrat obtenu/Refusé) — Propriétaire exclu", () => {
    expect(P.canRecordBudgetOutcome(OWNER)).toBe(true);
    expect(P.canRecordBudgetOutcome(BOSS)).toBe(false);
    expect(P.canRecordBudgetOutcome(ADMIN)).toBe(false);
  });
  it("Direction et Propriétaire modifient une ligne Achat 'Direction/Propriétaire' — Administration exclue", () => {
    expect(P.canModifyBudgetPurchaseLine(OWNER)).toBe(true);
    expect(P.canModifyBudgetPurchaseLine(BOSS)).toBe(true);
    expect(P.canModifyBudgetPurchaseLine(ADMIN)).toBe(false);
  });
});

describe("Conversion Budgétaire → Projet (confirmé le 12 août 2026)", () => {
  it("Direction seulement peut convertir — distinct de la création directe (Direction ET Propriétaire)", () => {
    expect(P.canConvertBudgetToProject(OWNER)).toBe(true);
    expect(P.canConvertBudgetToProject(BOSS)).toBe(false);
    expect(P.canConvertBudgetToProject(ADMIN)).toBe(false);
  });
  it("Propriétaire peut créer un projet directement, mais pas convertir un budgétaire", () => {
    expect(P.canCreateProjectDirectly(BOSS)).toBe(true);
    expect(P.canConvertBudgetToProject(BOSS)).toBe(false);
  });
  it("Employé et Magasinier n'accèdent jamais au détail financier d'un projet", () => {
    expect(P.canAccessProject(MEMBER)).toBe(false);
    expect(P.canAccessProject(WAREHOUSE)).toBe(false);
    expect(P.canAccessProject(OWNER)).toBe(true);
  });
});

describe("Punchs", () => {
  it("Direction approuve les punchs", () => {
    expect(P.canApprovePunch({}, OWNER)).toBe(true);
  });
  it("Administration n'approuve pas les punchs", () => {
    expect(P.canApprovePunch({}, ADMIN)).toBe(false);
  });
  it("Employé corrige son punch avant approbation", () => {
    expect(P.canEditOwnPunch(MEMBER, { employee: "emp-1", status: "submitted" }, "emp-1")).toBe(true);
  });
  it("Employé ne peut plus corriger après approbation", () => {
    expect(P.canEditOwnPunch(MEMBER, { employee: "emp-1", status: "approved" }, "emp-1")).toBe(false);
  });
});

describe("Facturation", () => {
  it("Direction demande la facturation", () => {
    expect(P.canRequestInvoice(OWNER)).toBe(true);
  });
  it("Administration ne demande pas (elle traite)", () => {
    expect(P.canRequestInvoice(ADMIN)).toBe(false);
  });
  it("Administration crée une facture", () => {
    expect(P.canCreateInvoiceRecord(ADMIN)).toBe(true);
  });
  it("Direction crée aussi une facture", () => {
    expect(P.canCreateInvoiceRecord(OWNER)).toBe(true);
  });
  it("Propriétaire ne crée jamais de facture", () => {
    expect(P.canCreateInvoiceRecord(BOSS)).toBe(false);
  });
  it("Direction enregistre le paiement", () => {
    expect(P.canRecordPayment(OWNER)).toBe(true);
  });
  it("Administration enregistre aussi le paiement", () => {
    expect(P.canRecordPayment(ADMIN)).toBe(true);
  });
  it("Direction met en suspens", () => {
    expect(P.canHoldInvoice(OWNER)).toBe(true);
  });
  it("Propriétaire ne met jamais en suspens", () => {
    expect(P.canHoldInvoice(BOSS)).toBe(false);
  });
});

describe("Livraisons / Roulements", () => {
  it("Direction marque la production complétée", () => {
    expect(P.canMarkProductionComplete(OWNER)).toBe(true);
  });
  it("Propriétaire ne marque jamais la production complétée", () => {
    expect(P.canMarkProductionComplete(BOSS)).toBe(false);
  });
  it("Administration ne marque pas la production complétée", () => {
    expect(P.canMarkProductionComplete(ADMIN)).toBe(false);
  });
  it("Direction choisit le mode de sortie", () => {
    expect(P.canChooseFulfillmentMode(OWNER)).toBe(true);
  });
  it("Administration choisit aussi le mode de sortie", () => {
    expect(P.canChooseFulfillmentMode(ADMIN)).toBe(true);
  });
  it("Propriétaire ne choisit jamais le mode de sortie", () => {
    expect(P.canChooseFulfillmentMode(BOSS)).toBe(false);
  });
  it("Direction crée un roulement directement", () => {
    expect(P.canCreateRollingDirectly(OWNER)).toBe(true);
  });
  it("Propriétaire crée aussi un roulement directement", () => {
    expect(P.canCreateRollingDirectly(BOSS)).toBe(true);
  });
  it("Administration ne crée pas de roulement directement", () => {
    expect(P.canCreateRollingDirectly(ADMIN)).toBe(false);
  });
  it("Direction crée un projet directement", () => {
    expect(P.canCreateProjectDirectly(OWNER)).toBe(true);
  });
  it("Propriétaire crée aussi un projet directement", () => {
    expect(P.canCreateProjectDirectly(BOSS)).toBe(true);
  });
  it("Administration ne crée pas de projet directement", () => {
    expect(P.canCreateProjectDirectly(ADMIN)).toBe(false);
  });
});

describe("Paramètres", () => {
  it("Direction accède aux Paramètres", () => {
    expect(P.canAccessSettings(OWNER)).toBe(true);
  });
  it("Administration n'accède jamais aux Paramètres", () => {
    expect(P.canAccessSettings(ADMIN)).toBe(false);
  });
  it("Administration ne modifie jamais un taux horaire", () => {
    expect(P.canModifyEmployeeRate(ADMIN)).toBe(false);
  });
});

// Règle confirmée directement avec l'utilisateur (11 août 2026, pas dans roles.js d'origine) —
// voir le commentaire dans src/roles.ts (canCreateClientRequest / canCreateServiceCall).
describe("Création de demandes clients et d'appels de service (règle confirmée le 11 août 2026)", () => {
  it("Direction, Administration et Propriétaire peuvent créer une demande client", () => {
    expect(P.canCreateClientRequest(OWNER)).toBe(true);
    expect(P.canCreateClientRequest(ADMIN)).toBe(true);
    expect(P.canCreateClientRequest(BOSS)).toBe(true);
  });
  it("Employé et Magasinier ne peuvent jamais créer une demande client", () => {
    expect(P.canCreateClientRequest(MEMBER)).toBe(false);
    expect(P.canCreateClientRequest(WAREHOUSE)).toBe(false);
  });
  it("Mêmes rôles pour la création d'un appel de service", () => {
    expect(P.canCreateServiceCall(OWNER)).toBe(true);
    expect(P.canCreateServiceCall(ADMIN)).toBe(true);
    expect(P.canCreateServiceCall(BOSS)).toBe(true);
    expect(P.canCreateServiceCall(MEMBER)).toBe(false);
    expect(P.canCreateServiceCall(WAREHOUSE)).toBe(false);
  });
  it("Mêmes rôles pour voir et gérer (notes/statut) une demande client", () => {
    for (const persona of [OWNER, ADMIN, BOSS]) {
      expect(P.canViewClientRequests(persona)).toBe(true);
      expect(P.canManageClientRequest(persona)).toBe(true);
    }
    for (const persona of [MEMBER, WAREHOUSE]) {
      expect(P.canViewClientRequests(persona)).toBe(false);
      expect(P.canManageClientRequest(persona)).toBe(false);
    }
  });
});

// Règle confirmée directement avec l'utilisateur (12 août 2026, pas dans roles.js d'origine) —
// voir le commentaire dans src/roles.ts (canSubmitPurchaseRequest).
describe("Soumission d'une demande d'achat — ouverte à tous depuis le 13 août 2026", () => {
  it("Tous les rôles peuvent soumettre (formulaire général ou liste rapide)", () => {
    for (const persona of [OWNER, ADMIN, BOSS, MEMBER, WAREHOUSE]) {
      expect(P.canSubmitPurchaseRequest(persona)).toBe(true);
    }
  });
  it("Une ligne sans catégorie (liste rapide) ne déclenche jamais le seuil du Propriétaire, peu importe le montant — comportement déjà correct de canApprovePurchaseRequest, sans modification", () => {
    const thresholds = { fabrication: 5000 };
    const lineSansCategorie = { amount: 50000 }; // gros montant, mais pas de "category" — comme une ligne de la liste rapide
    expect(P.canApprovePurchaseRequest({}, OWNER, lineSansCategorie, thresholds)).toBe(true);
    expect(P.canApprovePurchaseRequest({}, BOSS, lineSansCategorie, thresholds)).toBe(false); // pas nécessaire, jamais de double autorisation
  });
});

// Règle confirmée directement avec l'utilisatrice (13 août 2026, pas dans roles.js d'origine) —
// voir le commentaire dans src/roles.ts (canApprovePurchaseRequest, champ requesterPersona).
describe("Demandes d'achat — jamais de double autorisation quand le demandeur est Administration/Propriétaire/Direction (13 août 2026)", () => {
  const thresholds = { fabrication: 5000 };
  it("Demandeur Administration, gros montant : Direction seule approuve, jamais le Propriétaire", () => {
    const request = { category: "fabrication", amount: 50000, requesterPersona: ADMIN };
    expect(P.canApprovePurchaseRequest({}, OWNER, request, thresholds)).toBe(true);
    expect(P.canApprovePurchaseRequest({}, BOSS, request, thresholds)).toBe(false);
  });
  it("Demandeur Propriétaire, gros montant : Direction seule approuve", () => {
    const request = { category: "fabrication", amount: 50000, requesterPersona: BOSS };
    expect(P.canApprovePurchaseRequest({}, OWNER, request, thresholds)).toBe(true);
    expect(P.canApprovePurchaseRequest({}, BOSS, request, thresholds)).toBe(false);
  });
  it("Demandeur Direction, gros montant : Direction seule approuve", () => {
    const request = { category: "fabrication", amount: 50000, requesterPersona: OWNER };
    expect(P.canApprovePurchaseRequest({}, OWNER, request, thresholds)).toBe(true);
    expect(P.canApprovePurchaseRequest({}, BOSS, request, thresholds)).toBe(false);
  });
  it("Demandeur Employé, gros montant : le seuil s'applique normalement (double autorisation)", () => {
    const request = { category: "fabrication", amount: 50000, requesterPersona: MEMBER };
    expect(P.canApprovePurchaseRequest({}, OWNER, request, thresholds)).toBe(false);
    expect(P.canApprovePurchaseRequest({}, BOSS, request, thresholds)).toBe(true);
  });
  it("Demandeur Magasinier, gros montant : le seuil s'applique normalement (double autorisation)", () => {
    const request = { category: "fabrication", amount: 50000, requesterPersona: WAREHOUSE };
    expect(P.canApprovePurchaseRequest({}, OWNER, request, thresholds)).toBe(false);
    expect(P.canApprovePurchaseRequest({}, BOSS, request, thresholds)).toBe(true);
  });
  it("requesterPersona absent : comportement d'origine inchangé (rétrocompatibilité)", () => {
    const request = { category: "fabrication", amount: 50000 };
    expect(P.canApprovePurchaseRequest({}, OWNER, request, thresholds)).toBe(false);
    expect(P.canApprovePurchaseRequest({}, BOSS, request, thresholds)).toBe(true);
  });
});

// Déplacé depuis apps/api/src/modules/purchases/service.test.ts le 13 août
// 2026 en même temps que buildFrozenPurchaseThresholdsMap elle-même — voir
// le commentaire dans src/roles.ts : partagée entre apps/api (autorité
// réelle) et apps/web (même affichage que le serveur), donc définie ici.
describe("buildFrozenPurchaseThresholdsMap", () => {
  it("utilise le seuil gelé sur la demande, jamais un autre montant", () => {
    const map = P.buildFrozenPurchaseThresholdsMap({ category: "Outillage", thresholdAmountAtSubmission: 5000 });
    expect(map).toEqual({ Outillage: 5000 });
  });

  it("reste correct même si le seuil ACTUEL de la catégorie a changé depuis (confirmé le 12 août 2026 : jamais rétroactif)", () => {
    // Simule une demande soumise quand le seuil était 5000$, même si la catégorie affiche maintenant 2000$ ailleurs.
    const requestFrozenAt5000 = { category: "Outillage", thresholdAmountAtSubmission: 5000 };
    const map = P.buildFrozenPurchaseThresholdsMap(requestFrozenAt5000);
    expect(map.Outillage).toBe(5000); // pas 2000 — la valeur gelée l'emporte toujours
  });

  it("retourne une carte vide sans catégorie (liste rapide) — jamais de seuil", () => {
    expect(P.buildFrozenPurchaseThresholdsMap({ category: null, thresholdAmountAtSubmission: null })).toEqual({});
  });

  it("retourne une carte vide si le seuil gelé est manquant même avec une catégorie (garde défensive)", () => {
    expect(P.buildFrozenPurchaseThresholdsMap({ category: "Outillage", thresholdAmountAtSubmission: null })).toEqual({});
  });
});

describe("Suivi de commande et application au projet (13 août 2026)", () => {
  it("Direction peut gérer le suivi", () => {
    expect(P.canManagePurchaseFulfillment({}, OWNER)).toBe(true);
  });
  it("Propriétaire ne peut pas, sans délégation (voit tout, mais ne fait pas progresser le suivi)", () => {
    expect(P.canManagePurchaseFulfillment({}, BOSS)).toBe(false);
  });
  it("Administration/Employé/Magasinier ne peuvent pas, sans délégation", () => {
    expect(P.canManagePurchaseFulfillment({}, ADMIN)).toBe(false);
    expect(P.canManagePurchaseFulfillment({}, MEMBER)).toBe(false);
    expect(P.canManagePurchaseFulfillment({}, WAREHOUSE)).toBe(false);
  });
});

describe("Garantie (17 août 2026)", () => {
  it("Direction gère la garantie", () => {
    expect(P.canManageWarranty(OWNER)).toBe(true);
  });
  it("Propriétaire ne gère pas la garantie", () => {
    expect(P.canManageWarranty(BOSS)).toBe(false);
  });
  it("Administration/Employé/Magasinier ne gèrent pas la garantie", () => {
    expect(P.canManageWarranty(ADMIN)).toBe(false);
    expect(P.canManageWarranty(MEMBER)).toBe(false);
    expect(P.canManageWarranty(WAREHOUSE)).toBe(false);
  });
});
