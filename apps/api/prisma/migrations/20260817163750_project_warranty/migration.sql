-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "warrantyEndsAt" TIMESTAMP(3),
ADD COLUMN     "warrantyExpected" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WarrantyHistoryEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "previousEndsAt" TIMESTAMP(3),
    "newEndsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "invoiceReference" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarrantyHistoryEntry_projectId_idx" ON "WarrantyHistoryEntry"("projectId");

-- AddForeignKey
ALTER TABLE "WarrantyHistoryEntry" ADD CONSTRAINT "WarrantyHistoryEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
