-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "marginAtRiskThreshold" DECIMAL(5,2) NOT NULL DEFAULT 25,
ADD COLUMN     "marginConformeThreshold" DECIMAL(5,2) NOT NULL DEFAULT 30;
