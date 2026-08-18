/*
  Warnings:

  - A unique constraint covering the columns `[budgetModelRowId]` on the table `PunchableTask` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PunchableTask" ADD COLUMN     "budgetModelRowId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PunchableTask_budgetModelRowId_key" ON "PunchableTask"("budgetModelRowId");

-- AddForeignKey
ALTER TABLE "PunchableTask" ADD CONSTRAINT "PunchableTask_budgetModelRowId_fkey" FOREIGN KEY ("budgetModelRowId") REFERENCES "BudgetModelRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
