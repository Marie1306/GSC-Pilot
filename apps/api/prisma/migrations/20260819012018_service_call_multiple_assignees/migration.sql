/*
  Warnings:

  - You are about to drop the column `assignedEmployeeId` on the `ServiceCall` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ServiceCall" DROP COLUMN "assignedEmployeeId";

-- CreateTable
CREATE TABLE "_EmployeeToServiceCall" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmployeeToServiceCall_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_EmployeeToServiceCall_B_index" ON "_EmployeeToServiceCall"("B");

-- AddForeignKey
ALTER TABLE "_EmployeeToServiceCall" ADD CONSTRAINT "_EmployeeToServiceCall_A_fkey" FOREIGN KEY ("A") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmployeeToServiceCall" ADD CONSTRAINT "_EmployeeToServiceCall_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
