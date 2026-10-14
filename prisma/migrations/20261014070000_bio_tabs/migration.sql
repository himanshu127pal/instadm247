-- AlterTable
ALTER TABLE "BioBlock" ADD COLUMN     "tabId" TEXT;

-- AlterTable
ALTER TABLE "BioPage" ADD COLUMN     "homeLabel" TEXT NOT NULL DEFAULT 'Home';

-- CreateTable
CREATE TABLE "BioTab" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BioTab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BioRedirect" (
    "slug" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "tabId" TEXT,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BioRedirect_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "BioTab_pageId_order_idx" ON "BioTab"("pageId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "BioTab_pageId_slug_key" ON "BioTab"("pageId", "slug");

-- CreateIndex
CREATE INDEX "BioRedirect_pageId_idx" ON "BioRedirect"("pageId");


-- AddForeignKey
ALTER TABLE "BioTab" ADD CONSTRAINT "BioTab_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "BioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BioRedirect" ADD CONSTRAINT "BioRedirect_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "BioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BioBlock" ADD CONSTRAINT "BioBlock_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "BioTab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One link-in-bio page per Instagram account (docs/BIO.md). Before the
-- unique index can exist, fold every account's extra pages into its oldest
-- page as tabs, and keep their old addresses working as redirects.

-- 0. A page pointing at another workspace's account (the API never checked)
--    loses that link; it's treated like any page with no account below.
UPDATE "BioPage" p SET "accountId" = NULL
FROM "InstagramAccount" a
WHERE p."accountId" = a.id AND a."workspaceId" <> p."workspaceId";

-- 1. Pages with no account get one of their workspace's accounts that has no
--    page yet, oldest first, so each keeps its own link where it can.
WITH free_accounts AS (
  SELECT a.id, a."workspaceId",
         row_number() OVER (PARTITION BY a."workspaceId" ORDER BY a."createdAt", a.id) AS n
  FROM "InstagramAccount" a
  WHERE NOT EXISTS (SELECT 1 FROM "BioPage" p WHERE p."accountId" = a.id)
), orphans AS (
  SELECT p.id, p."workspaceId",
         row_number() OVER (PARTITION BY p."workspaceId" ORDER BY p."createdAt", p.id) AS n
  FROM "BioPage" p
  WHERE p."accountId" IS NULL
)
UPDATE "BioPage" p SET "accountId" = f.id
FROM orphans o JOIN free_accounts f ON f."workspaceId" = o."workspaceId" AND f.n = o.n
WHERE p.id = o.id;

-- 2. Any left over join the workspace's oldest account, and merge below. A
--    workspace with no account at all keeps its pages as they are.
UPDATE "BioPage" p SET "accountId" = (
  SELECT a.id FROM "InstagramAccount" a
  WHERE a."workspaceId" = p."workspaceId"
  ORDER BY a."createdAt", a.id LIMIT 1
)
WHERE p."accountId" IS NULL
  AND EXISTS (SELECT 1 FROM "InstagramAccount" a WHERE a."workspaceId" = p."workspaceId");

-- 3. Per account the oldest page stays; every other one becomes its tab.
CREATE TEMP TABLE bio_merge AS
SELECT p.id AS old_id, m.id AS main_id, p.slug, p.title, p.published, p."viewCount",
       row_number() OVER (PARTITION BY m.id ORDER BY p."createdAt", p.id) AS n
FROM "BioPage" p
JOIN LATERAL (
  SELECT q.id FROM "BioPage" q
  WHERE q."accountId" = p."accountId"
  ORDER BY q."createdAt", q.id LIMIT 1
) m ON true
WHERE p."accountId" IS NOT NULL AND p.id <> m.id;

-- The tab keeps the old page's link as its path, so /l/main/<old-link>.
INSERT INTO "BioTab" (id, "pageId", slug, label, "order", enabled, "createdAt", "updatedAt")
SELECT 'tab_' || old_id, main_id, slug, left(title, 30), n, published, now(), now()
FROM bio_merge;

-- Blocks move with their ids, so their tap counts stay. Social icons only
-- show on the home tab, so on a merged page they become ordinary buttons.
UPDATE "BioBlock" b SET
  "pageId" = m.main_id,
  "tabId" = 'tab_' || m.old_id,
  kind = CASE
    WHEN b.kind <> 'SOCIAL' THEN b.kind
    WHEN b.label = 'email' THEN 'EMAIL'
    WHEN b.label = 'whatsapp' THEN 'WHATSAPP'
    ELSE 'LINK' END,
  label = CASE WHEN b.kind = 'SOCIAL' THEN initcap(b.label) ELSE b.label END
FROM bio_merge m
WHERE b."pageId" = m.old_id;

UPDATE "BioPageView" v SET "pageId" = m.main_id FROM bio_merge m WHERE v."pageId" = m.old_id;
UPDATE "BioPage" p SET "viewCount" = p."viewCount" + s.total
FROM (SELECT main_id, sum("viewCount") AS total FROM bio_merge GROUP BY main_id) s
WHERE p.id = s.main_id;

-- Old links keep working for 90 days, then the address is free again.
INSERT INTO "BioRedirect" (slug, "pageId", "tabId", reason, "expiresAt", "createdAt")
SELECT slug, main_id, 'tab_' || old_id, 'merged', now() + interval '90 days', now()
FROM bio_merge;

DELETE FROM "BioPage" WHERE id IN (SELECT old_id FROM bio_merge);
DROP TABLE bio_merge;

-- CreateIndex
CREATE UNIQUE INDEX "BioPage_accountId_key" ON "BioPage"("accountId");
