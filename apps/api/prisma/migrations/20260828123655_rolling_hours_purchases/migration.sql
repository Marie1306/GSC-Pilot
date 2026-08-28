-- DropForeignKey
ALTER TABLE "ProjectPurchaseEntry" DROP CONSTRAINT "ProjectPurchaseEntry_projectId_fkey";

-- AlterTable
ALTER TABLE "ProjectPurchaseEntry" ADD COLUMN     "rollingId" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Rolling" ADD COLUMN     "backupHourlyRate" DECIMAL(10,2),
ADD COLUMN     "backupHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "backupHoursCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "plannedHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "plannedPurchases" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "rollingId" TEXT;

-- AddForeignKey
ALTER TABLE "ProjectPurchaseEntry" ADD CONSTRAINT "ProjectPurchaseEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPurchaseEntry" ADD CONSTRAINT "ProjectPurchaseEntry_rollingId_fkey" FOREIGN KEY ("rollingId") REFERENCES "Rolling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_rollingId_fkey" FOREIGN KEY ("rollingId") REFERENCES "Rolling"("id") ON DELETE SET NULL ON UPDATE CASCADE;
