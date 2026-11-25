-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "nextExternalSaleConfirmationNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "externalSaleConfirmationNumberYear" INTEGER NOT NULL DEFAULT 2026;

-- CreateTable
CREATE TABLE "ExternalSaleConfirmation" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "company" TEXT,
    "contactRole" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "clientPoNumber" TEXT,
    "introText" TEXT,
    "termsText" TEXT,
    "amountBeforeTax" DECIMAL(12,2) NOT NULL,
    "tpsAmount" DECIMAL(12,2) NOT NULL,
    "tvqAmount" DECIMAL(12,2) NOT NULL,
    "totalWithTax" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalSaleConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSaleConfirmationLine" (
    "id" TEXT NOT NULL,
    "confirmationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExternalSaleConfirmationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSaleConfirmation_displayId_key" ON "ExternalSaleConfirmation"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSaleConfirmation_quoteId_key" ON "ExternalSaleConfirmation"("quoteId");

-- AddForeignKey
ALTER TABLE "ExternalSaleConfirmation" ADD CONSTRAINT "ExternalSaleConfirmation_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ExternalSaleQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSaleConfirmationLine" ADD CONSTRAINT "ExternalSaleConfirmationLine_confirmationId_fkey" FOREIGN KEY ("confirmationId") REFERENCES "ExternalSaleConfirmation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
