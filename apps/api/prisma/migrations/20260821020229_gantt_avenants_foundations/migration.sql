-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN     "assignedEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "nextAmendmentNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "ProjectTask_assignedEmployeeId_idx" ON "ProjectTask"("assignedEmployeeId");

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
