-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "igScopedId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_igScopedId_key" ON "InstagramAccount"("igScopedId");

