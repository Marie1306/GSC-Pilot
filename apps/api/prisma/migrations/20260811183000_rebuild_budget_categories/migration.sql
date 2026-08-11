-- Refonte du budgétaire (12 août 2026, deuxième correction) : après vérification
-- catégorie par catégorie contre le vrai écran du prototype v19, la structure à
-- 8 catégories/un seul type de ligne était encore incomplète — 13 vraies
-- catégories, deux types de ligne (heures vs achat), et des permissions par
-- ligne. Réinitialisation complète des tables du budgétaire : seules des
-- données de test existaient (voir CLAUDE.md), aucune donnée réelle perdue.

-- Détache les demandes clients des budgétaires de test qui vont être effacés.
UPDATE "ClientRequest" SET "budgetId" = NULL WHERE "budgetId" IS NOT NULL;

DELETE FROM "BudgetRow";
DELETE FROM "BudgetSection";
DELETE FROM "Budget";
DELETE FROM "BudgetModelRow";
DELETE FROM "BudgetModelSection";
DELETE FROM "BudgetModel";

-- Colonnes utilisant l'ancien enum BudgetCategory — tables vides, retrait sûr.
ALTER TABLE "BudgetModelSection" DROP COLUMN "category";
ALTER TABLE "BudgetSection" DROP COLUMN "category";
ALTER TABLE "BudgetSection" DROP COLUMN "hourlyRate";

DROP TYPE "BudgetCategory";

CREATE TYPE "BudgetCategory" AS ENUM (
  'conception',
  'fabrication',
  'panelProgramming',
  'assemblyTest',
  'installationLabor',
  'stockFabrication',
  'stockPanel',
  'motorization',
  'hardware',
  'consumables',
  'subcontracting',
  'installationStock',
  'installationExpenses'
);

CREATE TYPE "BudgetSectionKind" AS ENUM ('labor', 'purchase');

ALTER TABLE "BudgetModelSection" ADD COLUMN "category" "BudgetCategory" NOT NULL;
ALTER TABLE "BudgetModelSection" ADD COLUMN "kind" "BudgetSectionKind" NOT NULL;
ALTER TABLE "BudgetModelSection" ADD CONSTRAINT "BudgetModelSection_budgetModelId_category_key" UNIQUE ("budgetModelId", "category");

ALTER TABLE "BudgetSection" ADD COLUMN "category" "BudgetCategory" NOT NULL;
ALTER TABLE "BudgetSection" ADD COLUMN "kind" "BudgetSectionKind" NOT NULL;
ALTER TABLE "BudgetSection" ADD CONSTRAINT "BudgetSection_budgetId_category_key" UNIQUE ("budgetId", "category");

-- BudgetModelRow : type Achat (unitPrice), éditabilité par ligne, ligne calculée automatiquement.
ALTER TABLE "BudgetModelRow" DROP COLUMN "purchaseAmount";
ALTER TABLE "BudgetModelRow" ALTER COLUMN "hourlyRate" SET DEFAULT 0;
ALTER TABLE "BudgetModelRow" ADD COLUMN "unitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "BudgetModelRow" ADD COLUMN "directionOnly" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BudgetModelRow" ADD COLUMN "autoFromRowId" TEXT;
ALTER TABLE "BudgetModelRow" ADD COLUMN "autoPct" DECIMAL(5,2);
ALTER TABLE "BudgetModelRow" ADD CONSTRAINT "BudgetModelRow_autoFromRowId_fkey" FOREIGN KEY ("autoFromRowId") REFERENCES "BudgetModelRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BudgetRow : type Achat (qty/unitPrice), éditabilité par ligne, ligne calculée automatiquement.
ALTER TABLE "BudgetRow" DROP COLUMN "purchaseAmount";
ALTER TABLE "BudgetRow" ALTER COLUMN "hourlyRate" SET DEFAULT 0;
ALTER TABLE "BudgetRow" ADD COLUMN "qty" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "BudgetRow" ADD COLUMN "unitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "BudgetRow" ADD COLUMN "directionOnly" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BudgetRow" ADD COLUMN "autoFromRowId" TEXT;
ALTER TABLE "BudgetRow" ADD COLUMN "autoPct" DECIMAL(5,2);
ALTER TABLE "BudgetRow" ADD CONSTRAINT "BudgetRow_autoFromRowId_fkey" FOREIGN KEY ("autoFromRowId") REFERENCES "BudgetRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
