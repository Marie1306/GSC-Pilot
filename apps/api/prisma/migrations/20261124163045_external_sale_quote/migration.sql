-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "nextExternalSaleQuoteNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "externalSaleQuoteNumberYear" INTEGER NOT NULL DEFAULT 2026;

-- AlterTable
ALTER TABLE "ExternalSale" ADD COLUMN     "quoteId" TEXT;

-- CreateTable
CREATE TABLE "ExternalSaleQuote" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "contactName" TEXT NOT NULL,
    "company" TEXT,
    "contactRole" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "transportFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adminFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "marginPct" DECIMAL(5,2) NOT NULL,
    "partsBaseCost" DECIMAL(12,2),
    "salePrice" DECIMAL(12,2),
    "tpsAmount" DECIMAL(12,2),
    "tvqAmount" DECIMAL(12,2),
    "totalWithTax" DECIMAL(12,2),
    "introText" TEXT,
    "termsText" TEXT,
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalSaleQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSaleQuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExternalSaleQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSaleQuote_displayId_key" ON "ExternalSaleQuote"("displayId");

-- CreateIndex
CREATE INDEX "ExternalSaleQuote_status_idx" ON "ExternalSaleQuote"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSale_quoteId_key" ON "ExternalSale"("quoteId");

-- AddForeignKey
ALTER TABLE "ExternalSale" ADD CONSTRAINT "ExternalSale_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ExternalSaleQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSaleQuoteLine" ADD CONSTRAINT "ExternalSaleQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ExternalSaleQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
