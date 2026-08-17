-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "installationPlannedCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "installationPlannedHours" DECIMAL(10,2) NOT NULL DEFAULT 0;
