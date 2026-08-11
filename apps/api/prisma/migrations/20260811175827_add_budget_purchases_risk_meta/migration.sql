-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BudgetCategory" ADD VALUE 'stock';
ALTER TYPE "BudgetCategory" ADD VALUE 'sousTraitance';
ALTER TYPE "BudgetCategory" ADD VALUE 'deplacements';

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "poNumber" TEXT,
ADD COLUMN     "projectBackupAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "projectBackupComplexity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "riskSummary" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BudgetModelRow" ADD COLUMN     "purchaseAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "BudgetRow" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "purchaseAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "risk" TEXT;
