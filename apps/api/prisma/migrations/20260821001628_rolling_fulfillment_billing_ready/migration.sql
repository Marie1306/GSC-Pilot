-- AlterTable
ALTER TABLE "Rolling" ADD COLUMN     "billingReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fulfillmentConfirmationNote" TEXT;
