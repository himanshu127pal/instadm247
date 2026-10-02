-- CreateTable
CREATE TABLE "MediaUpload" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "durationSec" DOUBLE PRECISION,
    "scheduledPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaUpload_token_key" ON "MediaUpload"("token");

-- CreateIndex
CREATE INDEX "MediaUpload_workspaceId_createdAt_idx" ON "MediaUpload"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaUpload_scheduledPostId_idx" ON "MediaUpload"("scheduledPostId");

-- AddForeignKey
ALTER TABLE "MediaUpload" ADD CONSTRAINT "MediaUpload_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUpload" ADD CONSTRAINT "MediaUpload_scheduledPostId_fkey" FOREIGN KEY ("scheduledPostId") REFERENCES "ScheduledPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
