-- AlterTable
ALTER TABLE "Amendment" ADD COLUMN     "targetInvoicePlanEntryId" TEXT;

-- AddForeignKey
ALTER TABLE "Amendment" ADD CONSTRAINT "Amendment_targetInvoicePlanEntryId_fkey" FOREIGN KEY ("targetInvoicePlanEntryId") REFERENCES "InvoicePlanEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
