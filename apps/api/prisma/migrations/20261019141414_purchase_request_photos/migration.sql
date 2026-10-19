-- CreateTable
CREATE TABLE "PurchaseRequestPhoto" (
    "id" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "imageDataUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseRequestPhoto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PurchaseRequestPhoto" ADD CONSTRAINT "PurchaseRequestPhoto_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
