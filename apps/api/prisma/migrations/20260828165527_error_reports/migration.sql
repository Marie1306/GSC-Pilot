-- CreateTable
CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "materialValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hoursLost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "hourlyRateSnapshot" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ErrorReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorReportPhoto" (
    "id" TEXT NOT NULL,
    "errorReportId" TEXT NOT NULL,
    "imageDataUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorReportPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorReport_employeeId_idx" ON "ErrorReport"("employeeId");

-- AddForeignKey
ALTER TABLE "ErrorReport" ADD CONSTRAINT "ErrorReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorReport" ADD CONSTRAINT "ErrorReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorReportPhoto" ADD CONSTRAINT "ErrorReportPhoto_errorReportId_fkey" FOREIGN KEY ("errorReportId") REFERENCES "ErrorReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
