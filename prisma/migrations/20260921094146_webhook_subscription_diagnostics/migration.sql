-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "lastWebhookTryAt" TIMESTAMP(3),
ADD COLUMN     "webhookError" TEXT,
ADD COLUMN     "webhookFields" TEXT[] DEFAULT ARRAY[]::TEXT[];
