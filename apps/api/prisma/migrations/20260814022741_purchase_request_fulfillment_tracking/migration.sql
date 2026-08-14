-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "appliedToProjectAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "fulfillmentStatus" TEXT;
