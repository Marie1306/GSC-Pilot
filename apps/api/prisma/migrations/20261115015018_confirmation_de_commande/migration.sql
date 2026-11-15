-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "confirmationNumberYear" INTEGER NOT NULL DEFAULT 2026,
ADD COLUMN     "nextConfirmationNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ConfirmationDeCommande" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "soumissionId" TEXT NOT NULL,
    "contactId" TEXT,
    "clientPoNumber" TEXT,
    "amountBeforeTax" DECIMAL(12,2) NOT NULL,
    "tpsAmount" DECIMAL(12,2) NOT NULL,
    "tvqAmount" DECIMAL(12,2) NOT NULL,
    "totalWithTax" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ConfirmationDeCommande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmationDeCommandeLine" (
    "id" TEXT NOT NULL,
    "confirmationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConfirmationDeCommandeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationDeCommande_displayId_key" ON "ConfirmationDeCommande"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationDeCommande_soumissionId_key" ON "ConfirmationDeCommande"("soumissionId");

-- AddForeignKey
ALTER TABLE "ConfirmationDeCommande" ADD CONSTRAINT "ConfirmationDeCommande_soumissionId_fkey" FOREIGN KEY ("soumissionId") REFERENCES "Soumission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationDeCommande" ADD CONSTRAINT "ConfirmationDeCommande_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationDeCommandeLine" ADD CONSTRAINT "ConfirmationDeCommandeLine_confirmationId_fkey" FOREIGN KEY ("confirmationId") REFERENCES "ConfirmationDeCommande"("id") ON DELETE CASCADE ON UPDATE CASCADE;
