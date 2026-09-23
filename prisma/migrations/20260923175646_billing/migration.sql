-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "error" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "billingCustomerId" TEXT,
ADD COLUMN     "planOverride" TEXT,
ADD COLUMN     "planOverrideById" TEXT,
ADD COLUMN     "planOverrideReason" TEXT,
ADD COLUMN     "planOverrideUntil" TIMESTAMP(3),
ALTER COLUMN "planKey" SET DEFAULT 'free';

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'dodo',
    "providerSubscriptionId" TEXT NOT NULL,
    "providerCustomerId" TEXT NOT NULL,
    "providerProductId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'dodo',
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "webhookId" TEXT,
    "type" TEXT,
    "workspaceId" TEXT,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "providerPaymentId" TEXT,
    "amount" INTEGER,
    "currency" TEXT,
    "signatureValid" BOOLEAN,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "payload" JSONB,
    "httpStatus" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_idx" ON "Subscription"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_workspaceId_period_metric_key" ON "UsageCounter"("workspaceId", "period", "metric");

-- CreateIndex
CREATE INDEX "PaymentEvent_workspaceId_receivedAt_idx" ON "PaymentEvent"("workspaceId", "receivedAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_status_receivedAt_idx" ON "PaymentEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_type_idx" ON "PaymentEvent"("type");

-- CreateIndex
CREATE INDEX "PaymentEvent_webhookId_idx" ON "PaymentEvent"("webhookId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_billingCustomerId_key" ON "Workspace"("billingCustomerId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Grandfather every workspace that exists before billing ships.
--
-- The planKey column default moves from 'unlimited' to 'free', which only
-- affects rows created from now on. Existing workspaces keep planKey
-- 'unlimited', and are given an explicit override so that the resolver —
-- which ignores planKey and recomputes it from overrides and subscriptions —
-- reaches the same answer rather than silently dropping them to Free.
--
-- Done as an override, not by leaving planKey alone, so that it is visible
-- and revocable per workspace in /admin, labelled with why it exists. This
-- covers the owner's workspace, testers, and the Meta App Review account.
UPDATE "Workspace"
SET "planOverride"       = 'unlimited',
    "planOverrideReason" = 'Workspace existed before billing launched',
    "planKey"            = 'unlimited';
