-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "billingReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fulfillmentConfirmationNote" TEXT;
