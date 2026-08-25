-- CreateTable
CREATE TABLE "BudgetNote" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetNote_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BudgetNote" ADD CONSTRAINT "BudgetNote_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
