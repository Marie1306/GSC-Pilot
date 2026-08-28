-- AlterTable
ALTER TABLE "Rolling" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ServiceCall" ADD COLUMN     "rollingId" TEXT;

-- AddForeignKey
ALTER TABLE "ServiceCall" ADD CONSTRAINT "ServiceCall_rollingId_fkey" FOREIGN KEY ("rollingId") REFERENCES "Rolling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

