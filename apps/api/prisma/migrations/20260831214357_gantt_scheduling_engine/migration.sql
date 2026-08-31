-- DropForeignKey
ALTER TABLE "ProjectTask" DROP CONSTRAINT "ProjectTask_projectId_fkey";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ganttAutoEnter" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN     "enteredGanttAt" TIMESTAMP(3),
ADD COLUMN     "enteredGanttById" TEXT,
ADD COLUMN     "rollingId" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Rolling" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "enteredGanttAt" TIMESTAMP(3),
ADD COLUMN     "enteredGanttById" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Interruption" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "date" DATE NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interruption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interruption_date_idx" ON "Interruption"("date");

-- CreateIndex
CREATE INDEX "Interruption_employeeId_date_idx" ON "Interruption"("employeeId", "date");

-- CreateIndex
CREATE INDEX "ProjectTask_rollingId_idx" ON "ProjectTask"("rollingId");

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_rollingId_fkey" FOREIGN KEY ("rollingId") REFERENCES "Rolling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interruption" ADD CONSTRAINT "Interruption_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
