/*
  Warnings:

  - You are about to drop the column `techLevelId` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `billRate` on the `TechLevel` table. All the data in the column will be lost.
  - Added the required column `extraRate` to the `TechLevel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `overtimeRate` to the `TechLevel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `regularRate` to the `TechLevel` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_techLevelId_fkey";

-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "techLevelId";

-- AlterTable
ALTER TABLE "TechLevel" DROP COLUMN "billRate",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "extraRate" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "overtimeRate" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "regularRate" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "rateType" TEXT,
ADD COLUMN     "techLevelId" TEXT;

-- CreateTable
CREATE TABLE "_EmployeeToTechLevel" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmployeeToTechLevel_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_EmployeeToTechLevel_B_index" ON "_EmployeeToTechLevel"("B");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_techLevelId_fkey" FOREIGN KEY ("techLevelId") REFERENCES "TechLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployeeToTechLevel" ADD CONSTRAINT "_EmployeeToTechLevel_A_fkey" FOREIGN KEY ("A") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployeeToTechLevel" ADD CONSTRAINT "_EmployeeToTechLevel_B_fkey" FOREIGN KEY ("B") REFERENCES "TechLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
