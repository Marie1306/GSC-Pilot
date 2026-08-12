import { describe, it, expect } from "vitest";
import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_SLUGS,
  MODULAR_BUDGET_CATEGORIES,
  BUDGET_CATEGORY_LABELS,
  BUDGET_CATEGORY_KIND,
  BUDGET_CATEGORY_GROUP,
  BUDGET_GROUP_LABELS,
  BACKUP_ELIGIBLE_ALIAS,
} from "../src/categories.js";

/**
 * Garde-fou anti-régression (audit du 12 août 2026, section K) : ce fichier
 * n'existait pas avant le catalogue unique. Son seul but est de faire
 * échouer bruyamment un test si quelqu'un retire/renomme/déplace une
 * catégorie de groupe par erreur, plutôt que de laisser 4 endroits dériver
 * silencieusement comme avant.
 */
describe("Catalogue des catégories — 13 catégories réelles, vérifiées v19 le 12 août 2026", () => {
  it("exactement 13 catégories, dans l'ordre d'affichage vérifié", () => {
    expect(BUDGET_CATEGORY_SLUGS).toEqual([
      "conception",
      "fabrication",
      "panelProgramming",
      "assemblyTest",
      "stockFabrication",
      "stockPanel",
      "motorization",
      "hardware",
      "consumables",
      "subcontracting",
      "installationLabor",
      "installationStock",
      "installationExpenses",
    ]);
  });

  it("chaque catégorie a un libellé et un groupe visuel", () => {
    for (const category of BUDGET_CATEGORIES) {
      expect(BUDGET_CATEGORY_LABELS[category.slug]).toBe(category.label);
      expect(BUDGET_GROUP_LABELS[category.group]).toBeTruthy();
    }
  });

  it("aucune catégorie 'labor' n'est modulable (vérifié v19 — pas de bouton + Ajouter une ligne sur les tâches fixes)", () => {
    const laborSlugs = BUDGET_CATEGORIES.filter((c) => c.kind === "labor").map((c) => c.slug);
    for (const slug of laborSlugs) {
      expect(MODULAR_BUDGET_CATEGORIES).not.toContain(slug);
    }
  });

  it("exactement 6 catégories modulables (lignes vierges ajoutées/retirées par Direction)", () => {
    expect(MODULAR_BUDGET_CATEGORIES).toEqual(["stockFabrication", "stockPanel", "motorization", "hardware", "subcontracting", "installationStock"]);
  });

  it("Consommables et Installation — Frais divers sont 'purchase' mais PAS modulables (lignes fixes nommées, pas vierges)", () => {
    expect(MODULAR_BUDGET_CATEGORIES).not.toContain("consumables");
    expect(MODULAR_BUDGET_CATEGORIES).not.toContain("installationExpenses");
    expect(BUDGET_CATEGORY_KIND.consumables).toBe("purchase");
    expect(BUDGET_CATEGORY_KIND.installationExpenses).toBe("purchase");
  });

  it("le groupe 'installation' réunit une catégorie labor et deux purchase (vérifié v19 : la 3e section du groupe visuel Installation/Service)", () => {
    const installationGroup = BUDGET_CATEGORIES.filter((c) => c.group === "installation").map((c) => c.slug);
    expect(installationGroup).toEqual(["installationLabor", "installationStock", "installationExpenses"]);
  });

  it("back-up d'heures : seules Fabrication, Panneau & Programmation et Assemblage & Test sont admissibles — jamais Conception ni Installation", () => {
    expect(Object.keys(BACKUP_ELIGIBLE_ALIAS)).toEqual(["fabrication", "panelProgramming", "assemblyTest"]);
    expect(BACKUP_ELIGIBLE_ALIAS.conception).toBeUndefined();
    expect(BACKUP_ELIGIBLE_ALIAS.installationLabor).toBeUndefined();
  });

  it("BUDGET_CATEGORY_GROUP couvre exactement les mêmes 13 slugs que le catalogue, sans en oublier ni en ajouter", () => {
    expect(Object.keys(BUDGET_CATEGORY_GROUP).sort()).toEqual([...BUDGET_CATEGORY_SLUGS].sort());
  });
});
