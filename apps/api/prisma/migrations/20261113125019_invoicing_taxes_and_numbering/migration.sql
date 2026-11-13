-- AlterTable
ALTER TABLE "InvoicePlanEntry" ADD COLUMN     "forecastDate" DATE,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "totalWithTax" DECIMAL(12,2),
ADD COLUMN     "tpsAmount" DECIMAL(12,2),
ADD COLUMN     "tvqAmount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "invoiceNumberYear" INTEGER NOT NULL DEFAULT 2026,
ADD COLUMN     "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tpsRatePct" DECIMAL(6,3) NOT NULL DEFAULT 5.000,
ADD COLUMN     "tvqRatePct" DECIMAL(6,3) NOT NULL DEFAULT 9.975;
