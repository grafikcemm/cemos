-- Content Intelligence (Eden-inspired) — Faz CI
-- ADDITIVE ONLY. No existing table is altered. 9 new tables.
--
-- DO NOT apply to production blindly. Canonical apply path:
--   1) Create a Neon branch (never prod first).
--   2) `npx prisma migrate deploy`  (or regenerate with `prisma migrate dev
--      --name content_intelligence_init` on the branch to let Prisma author it).
--   3) Verify, then promote.
-- Rollback = DROP the 9 tables below in reverse FK order (see tail of file).

-- ── ContentItem ──
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'external',
    "originTable" TEXT,
    "originId" TEXT,
    "creatorId" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'post',
    "format" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL DEFAULT '',
    "language" TEXT,
    "author" TEXT NOT NULL DEFAULT '',
    "mediaUrlsJson" TEXT NOT NULL DEFAULT '[]',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "rawMetadataJson" TEXT NOT NULL DEFAULT '{}',
    "ingestionStatus" TEXT NOT NULL DEFAULT 'normalized',
    "analysisStatus" TEXT NOT NULL DEFAULT 'pending',
    "publishedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- ── Creator ──
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "followers" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- ── CreatorBaseline ──
CREATE TABLE "CreatorBaseline" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'engagement',
    "medianValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorBaseline_pkey" PRIMARY KEY ("id")
);

-- ── ContentOutlierScore ──
CREATE TABLE "ContentOutlierScore" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'engagement',
    "metricValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baselineMedian" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "insufficient" BOOLEAN NOT NULL DEFAULT false,
    "explanationJson" TEXT NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentOutlierScore_pkey" PRIMARY KEY ("id")
);

-- ── Board ──
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- ── BoardSection ──
CREATE TABLE "BoardSection" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardSection_pkey" PRIMARY KEY ("id")
);

-- ── BoardItem ──
CREATE TABLE "BoardItem" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "sectionId" TEXT,
    "contentItemId" TEXT,
    "itemType" TEXT NOT NULL DEFAULT 'content',
    "title" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoardItem_pkey" PRIMARY KEY ("id")
);

-- ── Idea ──
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "angle" TEXT NOT NULL DEFAULT '',
    "hook" TEXT NOT NULL DEFAULT '',
    "bodyOutline" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT 'x',
    "format" TEXT NOT NULL DEFAULT '',
    "objective" TEXT NOT NULL DEFAULT '',
    "whyNow" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "voiceProfileId" TEXT,
    "scoresJson" TEXT NOT NULL DEFAULT '{}',
    "transformationType" TEXT,
    "promptVersion" TEXT NOT NULL DEFAULT '',
    "modelUsed" TEXT NOT NULL DEFAULT '',
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- ── IdeaSource ──
CREATE TABLE "IdeaSource" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'primary',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdeaSource_pkey" PRIMARY KEY ("id")
);

-- ── Indexes & unique constraints ──
CREATE UNIQUE INDEX "ContentItem_platform_externalId_key" ON "ContentItem"("platform", "externalId");
CREATE INDEX "ContentItem_platform_format_idx" ON "ContentItem"("platform", "format");
CREATE INDEX "ContentItem_creatorId_idx" ON "ContentItem"("creatorId");
CREATE INDEX "ContentItem_analysisStatus_idx" ON "ContentItem"("analysisStatus");
CREATE INDEX "ContentItem_publishedAt_idx" ON "ContentItem"("publishedAt");
CREATE INDEX "ContentItem_originTable_originId_idx" ON "ContentItem"("originTable", "originId");

CREATE UNIQUE INDEX "Creator_platform_handle_key" ON "Creator"("platform", "handle");
CREATE INDEX "Creator_platform_idx" ON "Creator"("platform");

CREATE UNIQUE INDEX "CreatorBaseline_creatorId_format_metric_key" ON "CreatorBaseline"("creatorId", "format", "metric");
CREATE INDEX "CreatorBaseline_platform_format_idx" ON "CreatorBaseline"("platform", "format");

CREATE UNIQUE INDEX "ContentOutlierScore_contentItemId_metric_key" ON "ContentOutlierScore"("contentItemId", "metric");
CREATE INDEX "ContentOutlierScore_multiplier_idx" ON "ContentOutlierScore"("multiplier");

CREATE INDEX "Board_accountId_idx" ON "Board"("accountId");
CREATE INDEX "BoardSection_boardId_idx" ON "BoardSection"("boardId");
CREATE INDEX "BoardItem_boardId_idx" ON "BoardItem"("boardId");
CREATE INDEX "BoardItem_sectionId_idx" ON "BoardItem"("sectionId");
CREATE INDEX "BoardItem_contentItemId_idx" ON "BoardItem"("contentItemId");

CREATE INDEX "Idea_accountId_status_idx" ON "Idea"("accountId", "status");
CREATE INDEX "Idea_platform_idx" ON "Idea"("platform");

CREATE UNIQUE INDEX "IdeaSource_ideaId_contentItemId_key" ON "IdeaSource"("ideaId", "contentItemId");
CREATE INDEX "IdeaSource_contentItemId_idx" ON "IdeaSource"("contentItemId");

-- ── Foreign keys ──
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreatorBaseline" ADD CONSTRAINT "CreatorBaseline_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentOutlierScore" ADD CONSTRAINT "ContentOutlierScore_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardSection" ADD CONSTRAINT "BoardSection_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardItem" ADD CONSTRAINT "BoardItem_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardItem" ADD CONSTRAINT "BoardItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "BoardSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BoardItem" ADD CONSTRAINT "BoardItem_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IdeaSource" ADD CONSTRAINT "IdeaSource_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdeaSource" ADD CONSTRAINT "IdeaSource_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ROLLBACK (manual; reverse FK order) ──
-- DROP TABLE "IdeaSource"; DROP TABLE "Idea"; DROP TABLE "BoardItem";
-- DROP TABLE "BoardSection"; DROP TABLE "Board"; DROP TABLE "ContentOutlierScore";
-- DROP TABLE "CreatorBaseline"; DROP TABLE "ContentItem"; DROP TABLE "Creator";
