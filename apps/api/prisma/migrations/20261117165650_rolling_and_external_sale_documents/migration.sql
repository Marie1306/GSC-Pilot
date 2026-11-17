-- CreateTable
CREATE TABLE "RollingDocument" (
    "id" TEXT NOT NULL,
    "rollingId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RollingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSaleDocument" (
    "id" TEXT NOT NULL,
    "externalSaleId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalSaleDocument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RollingDocument" ADD CONSTRAINT "RollingDocument_rollingId_fkey" FOREIGN KEY ("rollingId") REFERENCES "Rolling"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSaleDocument" ADD CONSTRAINT "ExternalSaleDocument_externalSaleId_fkey" FOREIGN KEY ("externalSaleId") REFERENCES "ExternalSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
