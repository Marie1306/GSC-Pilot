-- AlterTable
ALTER TABLE "ClientRequest" ADD COLUMN     "serviceCallId" TEXT;

-- AlterTable
ALTER TABLE "ServiceCall" ADD COLUMN     "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ClientRequest_serviceCallId_key" ON "ClientRequest"("serviceCallId");

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_serviceCallId_fkey" FOREIGN KEY ("serviceCallId") REFERENCES "ServiceCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

