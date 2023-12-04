/*
  Warnings:

  - You are about to drop the column `wasRestricted` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "wasRestricted",
ADD COLUMN     "restricted" BOOLEAN NOT NULL DEFAULT false;
