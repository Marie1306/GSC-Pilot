-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "displayId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Budget_displayId_key" ON "Budget"("displayId");
