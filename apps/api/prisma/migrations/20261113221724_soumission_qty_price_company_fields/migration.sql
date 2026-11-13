-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "companyBusinessNumber" TEXT,
ADD COLUMN     "companyWebsite" TEXT,
ADD COLUMN     "soumissionDefaultNote" TEXT;

-- AlterTable
ALTER TABLE "SoumissionLine" ADD COLUMN     "qty" DECIMAL(10,2) NOT NULL DEFAULT 1,
ADD COLUMN     "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;
