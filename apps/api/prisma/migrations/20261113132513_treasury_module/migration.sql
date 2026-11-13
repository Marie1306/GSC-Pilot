-- CreateTable
CREATE TABLE "TreasurySettings" (
    "id" TEXT NOT NULL,
    "checkingOpeningBalance" DECIMAL(12,2) NOT NULL,
    "checkingOpeningDate" DATE NOT NULL,
    "locOpeningBalance" DECIMAL(12,2) NOT NULL,
    "locOpeningDate" DATE NOT NULL,
    "sweepThreshold" DECIMAL(12,2) NOT NULL DEFAULT 20000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasurySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "defaultAmount" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpenseOverride" (
    "id" TEXT NOT NULL,
    "recurringExpenseId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "RecurringExpenseOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryManualEntry" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryManualEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringExpenseOverride_recurringExpenseId_yearMonth_key" ON "RecurringExpenseOverride"("recurringExpenseId", "yearMonth");

-- AddForeignKey
ALTER TABLE "RecurringExpenseOverride" ADD CONSTRAINT "RecurringExpenseOverride_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
