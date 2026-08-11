import { describe, it, expect } from "vitest";
import { BUDGET_CATEGORIES, MODULAR_CATEGORIES, BACKUP_ELIGIBLE_ALIAS } from "./service.js";
import { BudgetCategory as PrismaBudgetCategory } from "../../generated/prisma/enums.js";

/**
 * Garde-fou anti-régression (audit du 12 août 2026, section H/K). Ce test
 * ne touche pas la base de données — l'enum généré par Prisma est un objet
 * JS ordinaire, lisible sans connexion. Son seul but : si schema.prisma et
 * le catalogue unique (@gsc-pilot/business-rules/categories.ts) dérivent un
 * jour l'un de l'autre — catégorie ajoutée d'un côté, oubliée de l'autre —
 * ce test échoue immédiatement plutôt que de laisser un futur audit visuel
 * le découvrir.
 */
describe("BUDGET_CATEGORIES — synchronisé avec l'enum Prisma BudgetCategory", () => {
  it("mêmes 13 valeurs, dans le même ordre que le catalogue unique réexporté ici", () => {
    expect(BUDGET_CATEGORIES).toEqual([
      "conception",
      "fabrication",
      "panelProgramming",
      "assemblyTest",
      "installationLabor",
      "stockFabrication",
      "stockPanel",
      "motorization",
      "hardware",
      "consumables",
      "subcontracting",
      "installationStock",
      "installationExpenses",
    ]);
  });

  it("l'enum Prisma (schema.prisma) contient exactement les mêmes 13 catégories — aucune ajoutée/retirée d'un seul côté", () => {
    const prismaCategories = Object.values(PrismaBudgetCategory).sort();
    expect([...BUDGET_CATEGORIES].sort()).toEqual(prismaCategories);
  });

  it("MODULAR_CATEGORIES ne contient que des slugs valides du catalogue", () => {
    for (const slug of MODULAR_CATEGORIES) {
      expect(BUDGET_CATEGORIES).toContain(slug);
    }
  });

  it("BACKUP_ELIGIBLE_ALIAS ne référence que des slugs valides du catalogue", () => {
    for (const slug of Object.keys(BACKUP_ELIGIBLE_ALIAS)) {
      expect(BUDGET_CATEGORIES).toContain(slug);
    }
  });
});
