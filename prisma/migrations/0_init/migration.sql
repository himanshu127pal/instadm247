-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "planKey" TEXT NOT NULL DEFAULT 'unlimited',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "profilePictureUrl" TEXT,
    "accountType" TEXT,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "mediaCount" INTEGER NOT NULL DEFAULT 0,
    "accessTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastRefreshAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'connected',
    "webhookSubbed" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "slowDownUntil" TIMESTAMP(3),
    "automationPaused" BOOLEAN NOT NULL DEFAULT false,
    "pausedReason" TEXT,
    "viralProtection" BOOLEAN NOT NULL DEFAULT true,
    "viralThresholdPerMin" INTEGER NOT NULL DEFAULT 40,
    "lastViralTriggerAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "igMediaId" TEXT NOT NULL,
    "caption" TEXT,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "thumbnailUrl" TEXT,
    "permalink" TEXT,
    "timestamp" TIMESTAMP(3),
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "adId" TEXT,
    "adTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'SPECIFIC',
    "matchMode" TEXT NOT NULL DEFAULT 'KEYWORD',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "negativeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchType" TEXT NOT NULL DEFAULT 'CONTAINS',
    "caseSensitive" BOOLEAN NOT NULL DEFAULT false,
    "fuzzyMatch" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "reentryPolicy" TEXT NOT NULL DEFAULT 'ONCE_PER_MEDIA',
    "cooldownMinutes" INTEGER,
    "scheduleStart" TIMESTAMP(3),
    "scheduleEnd" TIMESTAMP(3),
    "publicReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "publicReplies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationMedia" (
    "automationId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,

    CONSTRAINT "AutomationMedia_pkey" PRIMARY KEY ("automationId","mediaId")
);

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Flow',
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedAutomation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "automationId" TEXT,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DRAFT_CODE',
    "draftCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "matchedMediaId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "igsid" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "profilePicUrl" TEXT,
    "followerCount" INTEGER,
    "isFollower" BOOLEAN,
    "followerCheckedAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "lastInteractionAt" TIMESTAMP(3),
    "windowExpiresAt" TIMESTAMP(3),
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "igConversationId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "humanTakeover" BOOLEAN NOT NULL DEFAULT false,
    "takeoverAt" TIMESTAMP(3),
    "assignedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "igMessageId" TEXT,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "payload" JSONB,
    "source" TEXT NOT NULL DEFAULT 'automation',
    "humanAgentTag" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "failReason" TEXT,
    "skipReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3),
    "flowRunId" TEXT,
    "nodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentReplyLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "igCommentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'private',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentReplyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "igsid" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowRun" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggerType" TEXT NOT NULL,
    "triggerPayload" JSONB,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "currentNodeId" TEXT,
    "resumeAt" TIMESTAMP(3),
    "haltReason" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowRunStep" (
    "id" TEXT NOT NULL,
    "flowRunId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" JSONB,
    "error" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "FlowRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IceBreaker" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "automationId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IceBreaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersistentMenu" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersistentMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "label" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkClick" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "contactId" TEXT,
    "flowRunId" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadForm" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FORM',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "successMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadResponse" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "flowRunId" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "score" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "segmentId" TEXT,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BROADCAST',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reengageAfterHours" INTEGER,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT,
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Assistant',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "persona" TEXT NOT NULL DEFAULT 'A friendly, concise assistant for an Instagram creator.',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "language" TEXT NOT NULL DEFAULT 'auto',
    "maxTurns" INTEGER NOT NULL DEFAULT 6,
    "bannedTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fallbackMessage" TEXT NOT NULL DEFAULT 'Let me get a human to help with that — one moment!',
    "handoffOnUnknown" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDoc" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "automationId" TEXT,
    "contactId" TEXT,
    "type" TEXT NOT NULL,
    "nodeId" TEXT,
    "value" DOUBLE PRECISION,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "automationId" TEXT,
    "date" DATE NOT NULL,
    "triggered" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "newFollowers" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponPool" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'UNIQUE',
    "sharedCode" TEXT,
    "description" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouponPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponCode" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BioPage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'comic',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "showBadge" BOOLEAN NOT NULL DEFAULT true,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BioPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BioBlock" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LINK',
    "label" TEXT NOT NULL,
    "url" TEXT,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BioBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BioBlockClick" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BioBlockClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BioPageView" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BioPageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'IMAGE',
    "caption" TEXT,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbUrl" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "publishedAt" TIMESTAMP(3),
    "igMediaId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attachAutomationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['read']::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" INTEGER,
    "lastFiredAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "targetId" TEXT,
    "targetName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewindJob" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "mediaId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewindJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Membership_workspaceId_idx" ON "Membership"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_workspaceId_key" ON "Membership"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_igUserId_key" ON "InstagramAccount"("igUserId");

-- CreateIndex
CREATE INDEX "InstagramAccount_workspaceId_idx" ON "InstagramAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "Media_accountId_idx" ON "Media"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Media_accountId_igMediaId_key" ON "Media"("accountId", "igMediaId");

-- CreateIndex
CREATE INDEX "Automation_accountId_triggerType_enabled_idx" ON "Automation"("accountId", "triggerType", "enabled");

-- CreateIndex
CREATE INDEX "AutomationMedia_mediaId_idx" ON "AutomationMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Flow_automationId_key" ON "Flow"("automationId");

-- CreateIndex
CREATE INDEX "PlannedAutomation_accountId_status_idx" ON "PlannedAutomation"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedAutomation_accountId_draftCode_key" ON "PlannedAutomation"("accountId", "draftCode");

-- CreateIndex
CREATE INDEX "Contact_accountId_lastInteractionAt_idx" ON "Contact"("accountId", "lastInteractionAt");

-- CreateIndex
CREATE INDEX "Contact_accountId_tags_idx" ON "Contact"("accountId", "tags");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_accountId_igsid_key" ON "Contact"("accountId", "igsid");

-- CreateIndex
CREATE INDEX "Conversation_accountId_lastMessageAt_idx" ON "Conversation"("accountId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_accountId_contactId_key" ON "Conversation"("accountId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_igMessageId_key" ON "Message"("igMessageId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_contactId_idx" ON "Message"("contactId");

-- CreateIndex
CREATE INDEX "CommentReplyLog_accountId_idx" ON "CommentReplyLog"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentReplyLog_accountId_igCommentId_kind_key" ON "CommentReplyLog"("accountId", "igCommentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_accountId_igsid_key" ON "SuppressionEntry"("accountId", "igsid");

-- CreateIndex
CREATE INDEX "FlowRun_accountId_status_idx" ON "FlowRun"("accountId", "status");

-- CreateIndex
CREATE INDEX "FlowRun_automationId_startedAt_idx" ON "FlowRun"("automationId", "startedAt");

-- CreateIndex
CREATE INDEX "FlowRun_status_resumeAt_idx" ON "FlowRun"("status", "resumeAt");

-- CreateIndex
CREATE INDEX "FlowRun_contactId_idx" ON "FlowRun"("contactId");

-- CreateIndex
CREATE INDEX "FlowRunStep_flowRunId_idx" ON "FlowRunStep"("flowRunId");

-- CreateIndex
CREATE INDEX "FlowRunStep_nodeId_status_idx" ON "FlowRunStep"("nodeId", "status");

-- CreateIndex
CREATE INDEX "Template_workspaceId_idx" ON "Template"("workspaceId");

-- CreateIndex
CREATE INDEX "IceBreaker_accountId_idx" ON "IceBreaker"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PersistentMenu_accountId_key" ON "PersistentMenu"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedLink_code_key" ON "TrackedLink"("code");

-- CreateIndex
CREATE INDEX "TrackedLink_workspaceId_idx" ON "TrackedLink"("workspaceId");

-- CreateIndex
CREATE INDEX "LinkClick_linkId_createdAt_idx" ON "LinkClick"("linkId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadForm_workspaceId_idx" ON "LeadForm"("workspaceId");

-- CreateIndex
CREATE INDEX "LeadResponse_formId_createdAt_idx" ON "LeadResponse"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadResponse_contactId_idx" ON "LeadResponse"("contactId");

-- CreateIndex
CREATE INDEX "Segment_workspaceId_idx" ON "Segment"("workspaceId");

-- CreateIndex
CREATE INDEX "Broadcast_workspaceId_status_idx" ON "Broadcast"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Broadcast_status_scheduledAt_idx" ON "Broadcast"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AiAgent_workspaceId_idx" ON "AiAgent"("workspaceId");

-- CreateIndex
CREATE INDEX "KnowledgeDoc_workspaceId_idx" ON "KnowledgeDoc"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_dedupeKey_key" ON "WebhookEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "WebhookEvent_accountId_createdAt_idx" ON "WebhookEvent"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_processed_idx" ON "WebhookEvent"("processed");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_accountId_type_createdAt_idx" ON "AnalyticsEvent"("accountId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_automationId_createdAt_idx" ON "AnalyticsEvent"("automationId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyStat_accountId_date_idx" ON "DailyStat"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_accountId_automationId_date_key" ON "DailyStat"("accountId", "automationId", "date");

-- CreateIndex
CREATE INDEX "CouponPool_workspaceId_idx" ON "CouponPool"("workspaceId");

-- CreateIndex
CREATE INDEX "CouponCode_poolId_issuedAt_idx" ON "CouponCode"("poolId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CouponCode_poolId_code_key" ON "CouponCode"("poolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CouponCode_poolId_contactId_key" ON "CouponCode"("poolId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "BioPage_slug_key" ON "BioPage"("slug");

-- CreateIndex
CREATE INDEX "BioPage_workspaceId_idx" ON "BioPage"("workspaceId");

-- CreateIndex
CREATE INDEX "BioBlock_pageId_order_idx" ON "BioBlock"("pageId", "order");

-- CreateIndex
CREATE INDEX "BioBlockClick_blockId_createdAt_idx" ON "BioBlockClick"("blockId", "createdAt");

-- CreateIndex
CREATE INDEX "BioPageView_pageId_createdAt_idx" ON "BioPageView"("pageId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduledPost_accountId_status_idx" ON "ScheduledPost"("accountId", "status");

-- CreateIndex
CREATE INDEX "ScheduledPost_status_scheduledAt_idx" ON "ScheduledPost"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_workspaceId_idx" ON "ApiKey"("workspaceId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_workspaceId_idx" ON "WebhookEndpoint"("workspaceId");

-- CreateIndex
CREATE INDEX "Integration_workspaceId_idx" ON "Integration"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_workspaceId_provider_targetId_key" ON "Integration"("workspaceId", "provider", "targetId");

-- CreateIndex
CREATE INDEX "RewindJob_accountId_status_idx" ON "RewindJob"("accountId", "status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAccount" ADD CONSTRAINT "InstagramAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationMedia" ADD CONSTRAINT "AutomationMedia_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationMedia" ADD CONSTRAINT "AutomationMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedAutomation" ADD CONSTRAINT "PlannedAutomation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedAutomation" ADD CONSTRAINT "PlannedAutomation_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_flowRunId_fkey" FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReplyLog" ADD CONSTRAINT "CommentReplyLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRunStep" ADD CONSTRAINT "FlowRunStep_flowRunId_fkey" FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IceBreaker" ADD CONSTRAINT "IceBreaker_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersistentMenu" ADD CONSTRAINT "PersistentMenu_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkClick" ADD CONSTRAINT "LinkClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TrackedLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkClick" ADD CONSTRAINT "LinkClick_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadForm" ADD CONSTRAINT "LeadForm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadResponse" ADD CONSTRAINT "LeadResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "LeadForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadResponse" ADD CONSTRAINT "LeadResponse_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadResponse" ADD CONSTRAINT "LeadResponse_flowRunId_fkey" FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDoc" ADD CONSTRAINT "KnowledgeDoc_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDoc" ADD CONSTRAINT "KnowledgeDoc_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStat" ADD CONSTRAINT "DailyStat_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStat" ADD CONSTRAINT "DailyStat_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponPool" ADD CONSTRAINT "CouponPool_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponCode" ADD CONSTRAINT "CouponCode_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "CouponPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponCode" ADD CONSTRAINT "CouponCode_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BioPage" ADD CONSTRAINT "BioPage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BioPage" ADD CONSTRAINT "BioPage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BioBlock" ADD CONSTRAINT "BioBlock_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "BioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BioBlockClick" ADD CONSTRAINT "BioBlockClick_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "BioBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BioPageView" ADD CONSTRAINT "BioPageView_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "BioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewindJob" ADD CONSTRAINT "RewindJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewindJob" ADD CONSTRAINT "RewindJob_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

