-- AlterTable
ALTER TABLE "RecurringExpense" ADD COLUMN     "dayOfWeek" INTEGER,
ADD COLUMN     "frequency" TEXT NOT NULL DEFAULT 'monthly',
ALTER COLUMN "dayOfMonth" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TreasurySettings" ADD COLUMN     "locCreditLimit" DECIMAL(12,2) NOT NULL DEFAULT 200000;
