-- CreateTable
CREATE TABLE "TeamNote" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "TeamNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamNote_recipientId_readAt_idx" ON "TeamNote"("recipientId", "readAt");

-- AddForeignKey
ALTER TABLE "TeamNote" ADD CONSTRAINT "TeamNote_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNote" ADD CONSTRAINT "TeamNote_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
