-- AlterTable
ALTER TABLE "ClientRequest" ADD COLUMN     "externalSaleId" TEXT;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "externalSaleId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "appliedToExternalSaleAt" TIMESTAMP(3),
ADD COLUMN     "externalSaleId" TEXT,
ADD COLUMN     "qty" DECIMAL(10,2),
ADD COLUMN     "unitCost" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "budgetNumberYear" INTEGER NOT NULL DEFAULT 2026,
ADD COLUMN     "clientRequestNumberYear" INTEGER NOT NULL DEFAULT 2026,
ADD COLUMN     "deliveryNumberYear" INTEGER NOT NULL DEFAULT 2026,
ADD COLUMN     "externalSaleDefaultMarginPct" DECIMAL(5,2) NOT NULL DEFAULT 20,
ADD COLUMN     "externalSaleNumberYear" INTEGER NOT NULL DEFAULT 2026,
ADD COLUMN     "nextExternalSaleNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "rollingNumberYear" INTEGER NOT NULL DEFAULT 2026,
ADD COLUMN     "serviceCallNumberYear" INTEGER NOT NULL DEFAULT 2026;

-- CreateTable
CREATE TABLE "ExternalSale" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "partsBaseCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transportFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adminFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "marginPct" DECIMAL(5,2) NOT NULL,
    "salePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "readyToDeliver" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "fulfillmentMode" TEXT,
    "fulfillmentStatus" TEXT,
    "fulfillmentDriverId" TEXT,
    "fulfillmentAddress" TEXT,
    "fulfillmentScheduled" TIMESTAMP(3),
    "billingReady" BOOLEAN NOT NULL DEFAULT false,
    "fulfillmentConfirmationNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSale_displayId_key" ON "ExternalSale"("displayId");

-- CreateIndex
CREATE INDEX "ExternalSale_status_idx" ON "ExternalSale"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRequest_externalSaleId_key" ON "ClientRequest"("externalSaleId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_externalSaleId_idx" ON "PurchaseRequest"("externalSaleId");

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_externalSaleId_fkey" FOREIGN KEY ("externalSaleId") REFERENCES "ExternalSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_externalSaleId_fkey" FOREIGN KEY ("externalSaleId") REFERENCES "ExternalSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_externalSaleId_fkey" FOREIGN KEY ("externalSaleId") REFERENCES "ExternalSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSale" ADD CONSTRAINT "ExternalSale_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

