/*
  Warnings:

  - You are about to drop the column `billRate` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `endAt` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `kmTraveled` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `mealsClaimed` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `ownerApprovedAt` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `ownerApprovedById` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `partPricingMarginPctOverride` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `scheduledAt` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `sentToAdminAt` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `signatureCaptured` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `signatureImageUrl` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `signatureSignerName` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `startAt` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `summary` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `techLevelId` on the `ServiceCall` table. All the data in the column will be lost.
  - You are about to drop the column `serviceCallId` on the `ServiceCallPart` table. All the data in the column will be lost.
  - You are about to drop the column `serviceCallId` on the `ServiceCallPhoto` table. All the data in the column will be lost.
  - You are about to drop the column `serviceCallId` on the `TimeEntry` table. All the data in the column will be lost.
  - Made the column `bonDeTravailId` on table `ServiceCallPart` required. This step will fail if there are existing NULL values in that column.
  - Made the column `bonDeTravailId` on table `ServiceCallPhoto` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ServiceCallPart" DROP CONSTRAINT "ServiceCallPart_bonDeTravailId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceCallPart" DROP CONSTRAINT "ServiceCallPart_serviceCallId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceCallPhoto" DROP CONSTRAINT "ServiceCallPhoto_bonDeTravailId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceCallPhoto" DROP CONSTRAINT "ServiceCallPhoto_serviceCallId_fkey";

-- DropForeignKey
ALTER TABLE "TimeEntry" DROP CONSTRAINT "TimeEntry_serviceCallId_fkey";

-- DropIndex
DROP INDEX "ServiceCall_status_idx";

-- AlterTable
ALTER TABLE "ServiceCall" DROP COLUMN "billRate",
DROP COLUMN "endAt",
DROP COLUMN "kmTraveled",
DROP COLUMN "mealsClaimed",
DROP COLUMN "ownerApprovedAt",
DROP COLUMN "ownerApprovedById",
DROP COLUMN "partPricingMarginPctOverride",
DROP COLUMN "scheduledAt",
DROP COLUMN "sentToAdminAt",
DROP COLUMN "signatureCaptured",
DROP COLUMN "signatureImageUrl",
DROP COLUMN "signatureSignerName",
DROP COLUMN "startAt",
DROP COLUMN "status",
DROP COLUMN "summary",
DROP COLUMN "techLevelId";

-- AlterTable
ALTER TABLE "ServiceCallPart" DROP COLUMN "serviceCallId",
ALTER COLUMN "bonDeTravailId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ServiceCallPhoto" DROP COLUMN "serviceCallId",
ALTER COLUMN "bonDeTravailId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TimeEntry" DROP COLUMN "serviceCallId";

-- AddForeignKey
ALTER TABLE "ServiceCallPart" ADD CONSTRAINT "ServiceCallPart_bonDeTravailId_fkey" FOREIGN KEY ("bonDeTravailId") REFERENCES "BonDeTravail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCallPhoto" ADD CONSTRAINT "ServiceCallPhoto_bonDeTravailId_fkey" FOREIGN KEY ("bonDeTravailId") REFERENCES "BonDeTravail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
