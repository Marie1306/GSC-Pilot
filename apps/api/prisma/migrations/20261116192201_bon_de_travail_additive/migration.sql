-- AlterTable
ALTER TABLE "ServiceCallPart" ADD COLUMN     "bonDeTravailId" TEXT;

-- AlterTable
ALTER TABLE "ServiceCallPhoto" ADD COLUMN     "bonDeTravailId" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "bonDeTravailNumberYear" INTEGER NOT NULL DEFAULT 2026,
ADD COLUMN     "nextBonDeTravailNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "bonDeTravailId" TEXT;

-- CreateTable
CREATE TABLE "BonDeTravail" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "serviceCallId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "kmTraveled" DECIMAL(10,2),
    "mealsBreakfastCount" INTEGER NOT NULL DEFAULT 0,
    "mealsLunchCount" INTEGER NOT NULL DEFAULT 0,
    "mealsDinnerCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "signatureCaptured" BOOLEAN NOT NULL DEFAULT false,
    "signatureImageUrl" TEXT,
    "signatureSignerName" TEXT,
    "ownerApprovedById" TEXT,
    "ownerApprovedAt" TIMESTAMP(3),
    "partPricingMarginPctOverride" DECIMAL(5,2),
    "invoicePlanEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BonDeTravail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BonDeTravailToEmployee" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BonDeTravailToEmployee_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "BonDeTravail_displayId_key" ON "BonDeTravail"("displayId");

-- CreateIndex
CREATE INDEX "BonDeTravail_serviceCallId_idx" ON "BonDeTravail"("serviceCallId");

-- CreateIndex
CREATE INDEX "_BonDeTravailToEmployee_B_index" ON "_BonDeTravailToEmployee"("B");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_bonDeTravailId_fkey" FOREIGN KEY ("bonDeTravailId") REFERENCES "BonDeTravail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonDeTravail" ADD CONSTRAINT "BonDeTravail_serviceCallId_fkey" FOREIGN KEY ("serviceCallId") REFERENCES "ServiceCall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonDeTravail" ADD CONSTRAINT "BonDeTravail_invoicePlanEntryId_fkey" FOREIGN KEY ("invoicePlanEntryId") REFERENCES "InvoicePlanEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCallPart" ADD CONSTRAINT "ServiceCallPart_bonDeTravailId_fkey" FOREIGN KEY ("bonDeTravailId") REFERENCES "BonDeTravail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCallPhoto" ADD CONSTRAINT "ServiceCallPhoto_bonDeTravailId_fkey" FOREIGN KEY ("bonDeTravailId") REFERENCES "BonDeTravail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BonDeTravailToEmployee" ADD CONSTRAINT "_BonDeTravailToEmployee_A_fkey" FOREIGN KEY ("A") REFERENCES "BonDeTravail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BonDeTravailToEmployee" ADD CONSTRAINT "_BonDeTravailToEmployee_B_fkey" FOREIGN KEY ("B") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
