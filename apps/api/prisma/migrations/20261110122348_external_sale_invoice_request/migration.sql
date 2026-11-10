-- AlterTable
ALTER TABLE "InvoicePlanEntry" ADD COLUMN     "externalSaleId" TEXT;

-- AddForeignKey
ALTER TABLE "InvoicePlanEntry" ADD CONSTRAINT "InvoicePlanEntry_externalSaleId_fkey" FOREIGN KEY ("externalSaleId") REFERENCES "ExternalSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
