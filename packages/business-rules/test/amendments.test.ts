// Porté 1-pour-1 depuis docs/handoff/03-modules-v01/amendments.test.js (21 assertions).
// Le bloc "Application au projet" ci-dessous a été ajusté le 16 novembre
// 2026 (retrait de l'assertion sur invoicePlan, voir amendments.ts et
// magical-finding-fog.md) — bogue réel confirmé par Marie, jamais un
// comportement à préserver.
import { describe, it, expect } from "vitest";
import {
  calculateAmendment,
  applyAmendmentToProject,
  selectAmendmentTargetInvoiceEntry,
  amendmentTasks,
  amendmentInvoiceRequest,
  type AmendmentProjectLike,
  type InvoicePlanEntryLike,
} from "../src/amendments.js";

describe("Back-up : mêmes catégories admissibles que le calcul principal (134/44/338, taux figé 112$)", () => {
  it("Conception/Installation exclues même à 999h, back-up et coût corrects", () => {
    const hours = {
      conception: 999, // exclu
      "fabrication-usinage": 134,
      programmation: 44,
      assemblage: 338,
      installation: 999, // exclu
    };
    const calc = calculateAmendment(hours, { marginPct: 20, backupPct: 10, projectBackupRate: 112, purchases: 0 });
    expect(calc.backupEligibleHours).toBe(516);
    expect(calc.backupHours).toBe(51.6);
    expect(calc.backupCost).toBeCloseTo(5779.2, 2);
  });
});

describe("Fabrication divisée en sous-catégories : coût identique à un seul bloc", () => {
  it("5 × 20h réparties = même coût et mêmes heures qu'un seul bloc de 100h", () => {
    const unSeulBloc = calculateAmendment({ fabrication: 100 }, { marginPct: 0, backupPct: 0, projectBackupRate: 112 });
    const diviseEnCinq = calculateAmendment(
      { "fabrication-plasma": 20, "fabrication-pliage": 20, "fabrication-usinage": 20, "fabrication-soudage": 20, "fabrication-peinture": 20 },
      { marginPct: 0, backupPct: 0, projectBackupRate: 112 },
    );
    expect(diviseEnCinq.laborCost).toBe(unSeulBloc.laborCost);
    expect(diviseEnCinq.laborHours).toBe(unSeulBloc.laborHours);
  });
});

describe("Marge et prix de vente", () => {
  it("10h conception à 117$/h, marge 20%", () => {
    const calc = calculateAmendment({ conception: 10 }, { marginPct: 20, backupPct: 0, projectBackupRate: 112, purchases: 0 });
    // 10h x 117$/h = 1170$ coût; prix vente = 1170 / 0.8 = 1462.50$
    expect(calc.laborCost).toBe(1170);
    expect(calc.sale).toBe(1462.5);
  });
});

describe("Application au projet — additionne, ne remplace jamais", () => {
  it("heures/coût/achats/prix vendu additionnés ; plus aucun lien avec le plan de facturation", () => {
    const project: AmendmentProjectLike = {
      laborHours: 50,
      laborCost: 5000,
      backupHours: 5,
      backupHoursCost: 560,
      plannedPurchases: 100,
      sold: 10000,
    };
    const calc = calculateAmendment({ conception: 10 }, { marginPct: 20, backupPct: 0, projectBackupRate: 112, purchases: 50 });
    applyAmendmentToProject(project, calc);
    expect(project.laborHours).toBe(60);
    expect(project.laborCost).toBe(6170);
    expect(project.plannedPurchases).toBe(150);
    expect(project.sold).toBe(11525); // 10 000 + 1 525 (1220$ coût / 0,8)
  });
});

describe("selectAmendmentTargetInvoiceEntry — le jalon qui absorbe l'avenant en entier (16 novembre 2026)", () => {
  it("choisit le dernier jalon standard pending (sortOrder le plus élevé), ignore les jalons déjà envoyés", () => {
    const entries: InvoicePlanEntryLike[] = [
      { id: "a", sortOrder: 0, isExtra: false, status: "sent" },
      { id: "b", sortOrder: 1, isExtra: false, status: "sent" },
      { id: "c", sortOrder: 2, isExtra: false, status: "sent" },
      { id: "d", sortOrder: 3, isExtra: false, status: "pending" },
    ];
    expect(selectAmendmentTargetInvoiceEntry(entries)?.id).toBe("d");
  });

  it("ignore les jalons isExtra (avenants précédents déjà routés en document séparé)", () => {
    const entries: InvoicePlanEntryLike[] = [
      { id: "standard", sortOrder: 1, isExtra: false, status: "pending" },
      { id: "extra-precedent", sortOrder: 2, isExtra: true, status: "pending" },
    ];
    expect(selectAmendmentTargetInvoiceEntry(entries)?.id).toBe("standard");
  });

  it("aucun jalon standard pending → null (repli sur un document séparé côté appelant)", () => {
    const entries: InvoicePlanEntryLike[] = [
      { id: "a", sortOrder: 0, isExtra: false, status: "sent" },
      { id: "b", sortOrder: 1, isExtra: false, status: "sent" },
    ];
    expect(selectAmendmentTargetInvoiceEntry(entries)).toBe(null);
  });

  it("liste vide → null", () => {
    expect(selectAmendmentTargetInvoiceEntry([])).toBe(null);
  });
});

describe("Génération des tâches détaillées", () => {
  it("4 tâches (2 sous-catégories fabrication + 2 catégories simples)", () => {
    const tasks = amendmentTasks("AV-042", {
      "fabrication-plasma": 5,
      "fabrication-usinage": 8,
      programmation: 12,
      assemblage: 6,
    });
    expect(tasks.length).toBe(4);
    const plasma = tasks.find((t) => t.subcategory === "fabrication-plasma");
    expect(plasma?.subcategory).toBe("fabrication-plasma"); // sous-catégorie conservée pour le détail
    expect(plasma?.category).toBe("fabrication"); // catégorie Gantt — s'agrège avec le reste
    expect(plasma?.cost).toBe(560); // 5h × 112$/h
    expect(tasks.every((t) => !("subassemblyId" in t))).toBe(true); // réserve générale, jamais un sous-assemblage de Marc
  });

  it("catégorie à 0h n'est pas incluse", () => {
    const tasks = amendmentTasks("AV-043", { fabrication: 0, conception: 5 });
    expect(tasks.length).toBe(1);
  });
});

describe("Facturation de l'avenant — même mécanisme que les extras d'installation", () => {
  it("montant = prix de vente, en attente, aucune facture liée avant traitement", () => {
    const calc = calculateAmendment({ conception: 10 }, { marginPct: 20, backupPct: 0, projectBackupRate: 112, purchases: 0 });
    const request = amendmentInvoiceRequest("AV-042", calc);
    expect(request.amount).toBe(calc.sale);
    expect(request.status).toBe("pending");
    expect(request.invoice).toBe(null);
  });
});
