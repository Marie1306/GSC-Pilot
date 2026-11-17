-- CreateTable
CREATE TABLE "InvoicePlanEntryLine" (
    "id" TEXT NOT NULL,
    "invoicePlanEntryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoicePlanEntryLine_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InvoicePlanEntryLine" ADD CONSTRAINT "InvoicePlanEntryLine_invoicePlanEntryId_fkey" FOREIGN KEY ("invoicePlanEntryId") REFERENCES "InvoicePlanEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
