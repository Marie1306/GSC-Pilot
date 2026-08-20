-- AlterTable
ALTER TABLE "PunchableTask" ADD COLUMN     "specificServiceRate" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "urgencyFee" DECIMAL(10,2) NOT NULL DEFAULT 0;
