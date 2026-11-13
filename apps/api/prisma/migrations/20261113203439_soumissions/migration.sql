-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "companyAddress" TEXT,
ADD COLUMN     "companyEmail" TEXT,
ADD COLUMN     "companyLegalName" TEXT,
ADD COLUMN     "companyPhone" TEXT,
ADD COLUMN     "companyTpsNumber" TEXT,
ADD COLUMN     "companyTvqNumber" TEXT,
ADD COLUMN     "nextSoumissionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "soumissionNumberYear" INTEGER NOT NULL DEFAULT 2026;

-- CreateTable
CREATE TABLE "Soumission" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "contactId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "introText" TEXT,
    "termsText" TEXT,
    "amountBeforeTax" DECIMAL(12,2),
    "tpsAmount" DECIMAL(12,2),
    "tvqAmount" DECIMAL(12,2),
    "totalWithTax" DECIMAL(12,2),
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Soumission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoumissionLine" (
    "id" TEXT NOT NULL,
    "soumissionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SoumissionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Soumission_displayId_key" ON "Soumission"("displayId");

-- CreateIndex
CREATE INDEX "Soumission_budgetId_idx" ON "Soumission"("budgetId");

-- CreateIndex
CREATE INDEX "Soumission_status_idx" ON "Soumission"("status");

-- AddForeignKey
ALTER TABLE "Soumission" ADD CONSTRAINT "Soumission_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Soumission" ADD CONSTRAINT "Soumission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoumissionLine" ADD CONSTRAINT "SoumissionLine_soumissionId_fkey" FOREIGN KEY ("soumissionId") REFERENCES "Soumission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
