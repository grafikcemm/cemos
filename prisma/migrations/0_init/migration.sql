-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "xHandle" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "maxChars" INTEGER NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'x',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "toneRules" TEXT NOT NULL,
    "formatRules" TEXT NOT NULL,
    "forbiddenRules" TEXT NOT NULL,
    "modes" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'TWEET',
    "thresholdLikes" INTEGER NOT NULL DEFAULT 10,
    "thresholdRetweets" INTEGER NOT NULL DEFAULT 2,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "socialDataUserId" TEXT,
    "socialDataUserIdUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcePost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'x',
    "externalId" TEXT,
    "sourceWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "engagementScore" INTEGER NOT NULL DEFAULT 0,
    "author" TEXT,
    "lang" TEXT,
    "text" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "retweetCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "viralScore" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "opportunityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'new',
    "mediaUrls" TEXT NOT NULL DEFAULT '[]',
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourcePostId" TEXT,
    "content" TEXT NOT NULL,
    "editedContent" TEXT,
    "draftType" TEXT NOT NULL DEFAULT 'TWEET',
    "mode" TEXT NOT NULL DEFAULT 'ai_news',
    "status" TEXT NOT NULL DEFAULT 'new',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedMock" BOOLEAN NOT NULL DEFAULT false,
    "scores" TEXT NOT NULL DEFAULT '{}',
    "lintReport" TEXT,
    "candidatesJson" TEXT NOT NULL DEFAULT '[]',
    "threadSegments" TEXT,
    "lastError" TEXT,
    "approvedAt" TIMESTAMP(3),
    "newsItemId" TEXT,
    "imageUrl" TEXT,
    "generatedImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'daily',
    "lastScanAt" TIMESTAMP(3),
    "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scanCron" TEXT NOT NULL DEFAULT '0 9 * * *',
    "dailyMaxPosts" INTEGER NOT NULL DEFAULT 3,
    "quietStartHour" INTEGER NOT NULL DEFAULT 23,
    "quietEndHour" INTEGER NOT NULL DEFAULT 8,
    "calendarStrategy" TEXT NOT NULL DEFAULT 'manual',
    "lastPublishAt" TIMESTAMP(3),
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourcesScanned" INTEGER NOT NULL DEFAULT 0,
    "tweetsFound" INTEGER NOT NULL DEFAULT 0,
    "postsInserted" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errors" TEXT NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "queueItemId" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedMock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "type" TEXT NOT NULL,
    "tweetCount" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "provider" TEXT,
    "model" TEXT,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "platform" TEXT NOT NULL DEFAULT 'x',
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platform" TEXT NOT NULL DEFAULT 'x',
    "externalId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViralPattern" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "patternName" TEXT NOT NULL,
    "category" TEXT,
    "hookType" TEXT,
    "structureJson" TEXT NOT NULL DEFAULT '{}',
    "emotion" TEXT NOT NULL DEFAULT '',
    "viralityTrigger" TEXT NOT NULL DEFAULT '',
    "exampleGood" TEXT NOT NULL DEFAULT '',
    "exampleBad" TEXT NOT NULL DEFAULT '',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "successScore" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trendingPotential" INTEGER NOT NULL DEFAULT 0,
    "audienceInterest" INTEGER NOT NULL DEFAULT 0,
    "newsValue" INTEGER NOT NULL DEFAULT 0,
    "angleSuggestionsJson" TEXT NOT NULL DEFAULT '[]',
    "sourcePostId" TEXT,
    "sourceType" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'x',
    "validatedAt" TIMESTAMP(3),
    "validatedSupport" INTEGER NOT NULL DEFAULT 0,
    "embeddingJson" TEXT,
    "embeddingHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViralPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingExample" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "inputType" TEXT NOT NULL,
    "sourceContent" TEXT,
    "outputContent" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "embeddingJson" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'x',
    "seriesKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "queueItemId" TEXT,
    "sourcePostId" TEXT,
    "feedbackType" TEXT NOT NULL,
    "originalContent" TEXT,
    "editedContent" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "editDistance" DOUBLE PRECISION,
    "platform" TEXT NOT NULL DEFAULT 'x',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalTest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "sourceContent" TEXT,
    "expectedBehavior" TEXT,
    "generatedOutput" TEXT NOT NULL DEFAULT '',
    "score" DOUBLE PRECISION,
    "failureReason" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'x',
    "pipelineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineTrace" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'x',
    "pipelineId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "stagesJson" TEXT NOT NULL DEFAULT '[]',
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "feedUrl" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'rss',
    "category" TEXT NOT NULL DEFAULT 'ai',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "reliability" TEXT NOT NULL DEFAULT 'medium',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "fetchIntervalMin" INTEGER NOT NULL DEFAULT 1440,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "newsSourceId" TEXT,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "originalTitle" TEXT NOT NULL,
    "trTitle" TEXT,
    "originalSummary" TEXT,
    "trSummary" TEXT,
    "category" TEXT NOT NULL DEFAULT 'ai',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "lang" TEXT,
    "imageUrl" TEXT,
    "viralScore" INTEGER,
    "xValueScore" INTEGER,
    "buzzScore" INTEGER,
    "hnPoints" INTEGER,
    "hnComments" INTEGER,
    "redditScore" INTEGER,
    "externalSignalsAt" TIMESTAMP(3),
    "whyPeopleCare" TEXT,
    "tweetAngle" TEXT,
    "suggestedFormat" TEXT,
    "sourceVerification" TEXT,
    "processingStatus" TEXT NOT NULL DEFAULT 'raw',
    "translationStatus" TEXT NOT NULL DEFAULT 'pending',
    "analysisStatus" TEXT NOT NULL DEFAULT 'pending',
    "modelUsed" TEXT,
    "errorMessage" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentOpportunity" (
    "id" TEXT NOT NULL,
    "newsItemId" TEXT,
    "accountId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'news',
    "turkishTitle" TEXT NOT NULL,
    "oneLineValue" TEXT NOT NULL DEFAULT '',
    "tweetAngle" TEXT NOT NULL DEFAULT '',
    "contentFormat" TEXT NOT NULL DEFAULT 'punch',
    "xValueScore" INTEGER NOT NULL DEFAULT 0,
    "noveltyScore" INTEGER NOT NULL DEFAULT 0,
    "usefulnessScore" INTEGER NOT NULL DEFAULT 0,
    "visualScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoRadarItem" (
    "id" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "topics" TEXT NOT NULL DEFAULT '[]',
    "descriptionTr" TEXT NOT NULL DEFAULT '',
    "whyItMatters" TEXT NOT NULL DEFAULT '',
    "bestFor" TEXT,
    "tweetHook" TEXT NOT NULL DEFAULT '',
    "xValueScore" INTEGER NOT NULL DEFAULT 0,
    "lastCommitAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "modelUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepoRadarItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolboxResource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL DEFAULT 'tool',
    "category" TEXT NOT NULL DEFAULT 'general',
    "platform" TEXT,
    "useCase" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "whyUseful" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "xValueScore" INTEGER NOT NULL DEFAULT 0,
    "sourceReliability" TEXT NOT NULL DEFAULT 'medium',
    "contentFormat" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "linkStatus" TEXT DEFAULT 'unknown',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolboxResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "useCase" TEXT,
    "promptText" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'tr',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'seed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordEntry" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "termTr" TEXT NOT NULL,
    "termEn" TEXT NOT NULL,
    "termLocal" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'seed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptFormula" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "examplesJson" TEXT NOT NULL DEFAULT '[]',
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptFormula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModelSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "rankingsJson" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'static',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModelSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyDigest" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "newsSummary" TEXT NOT NULL DEFAULT '',
    "repoSummary" TEXT NOT NULL DEFAULT '',
    "aiTips" TEXT NOT NULL DEFAULT '',
    "modelUsed" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YtChannel" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "viewCountTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uploadsPlaylistId" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'global',
    "isCompetitor" BOOLEAN NOT NULL DEFAULT true,
    "discoveredFrom" TEXT NOT NULL DEFAULT 'seed',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rollingMedianVpd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YtChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YtVideo" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "isShort" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "likeCount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commentCount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewsPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outlierScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "likeRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YtVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YtBrief" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pillar" TEXT NOT NULL DEFAULT '',
    "titleVariantsJson" TEXT NOT NULL DEFAULT '[]',
    "thumbnailConcept" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "hookScript" TEXT NOT NULL DEFAULT '',
    "fullScript" TEXT NOT NULL DEFAULT '',
    "outlineJson" TEXT NOT NULL DEFAULT '[]',
    "differentiationAnalysis" TEXT NOT NULL DEFAULT '',
    "editingNotes" TEXT NOT NULL DEFAULT '',
    "shootingNotes" TEXT NOT NULL DEFAULT '',
    "transcriptUsed" BOOLEAN NOT NULL DEFAULT false,
    "sourceTranscript" TEXT NOT NULL DEFAULT '',
    "modelUsed" TEXT NOT NULL DEFAULT '',
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "editedScript" TEXT,
    "feedbackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YtBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgMedia" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "mediaType" TEXT NOT NULL DEFAULT '',
    "permalink" TEXT NOT NULL DEFAULT '',
    "postedAt" TIMESTAMP(3),
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgComment" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "username" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "trText" TEXT NOT NULL DEFAULT '',
    "lang" TEXT NOT NULL DEFAULT '',
    "intent" TEXT NOT NULL DEFAULT '',
    "intentConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sentiment" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'new',
    "analysisJson" TEXT NOT NULL DEFAULT '{}',
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgReplyDraft" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "variant" INTEGER NOT NULL DEFAULT 0,
    "textTr" TEXT NOT NULL DEFAULT '',
    "textOriginal" TEXT,
    "tone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "editedText" TEXT,
    "riskWarning" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgReplyDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgConversation" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL DEFAULT '',
    "participantUsername" TEXT NOT NULL DEFAULT '',
    "lastMessageAt" TIMESTAMP(3),
    "rollingSummary" TEXT NOT NULL DEFAULT '',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL DEFAULT '',
    "trText" TEXT NOT NULL DEFAULT '',
    "lang" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgDmDraft" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "variant" INTEGER NOT NULL DEFAULT 0,
    "textTr" TEXT NOT NULL DEFAULT '',
    "textOriginal" TEXT,
    "tone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "editedText" TEXT,
    "riskWarning" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgDmDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgInsightSnapshot" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "accountsEngaged" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "topMediaJson" TEXT NOT NULL DEFAULT '[]',
    "seriesJson" TEXT NOT NULL DEFAULT '[]',
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgInsightSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'youtube',
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "channelTitle" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "lang" TEXT,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnTranscript" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'innertube',
    "lang" TEXT,
    "segmentsJson" TEXT NOT NULL DEFAULT '[]',
    "fullText" TEXT NOT NULL DEFAULT '',
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnChunk" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "sectionIdx" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnPack" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL DEFAULT '',
    "promptVersion" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "category" TEXT NOT NULL DEFAULT 'diger',
    "summaryL1" TEXT NOT NULL DEFAULT '',
    "summaryL2" TEXT NOT NULL DEFAULT '',
    "summaryL3" TEXT NOT NULL DEFAULT '',
    "notesJson" TEXT NOT NULL DEFAULT '[]',
    "qaReportJson" TEXT NOT NULL DEFAULT '{}',
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "modelUsed" TEXT NOT NULL DEFAULT '',
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnConcept" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "definition" TEXT NOT NULL DEFAULT '',
    "importance" INTEGER NOT NULL DEFAULT 50,
    "groundingJson" TEXT NOT NULL DEFAULT '[]',
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnItem" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "conceptId" TEXT,
    "kind" TEXT NOT NULL,
    "front" TEXT NOT NULL DEFAULT '',
    "back" TEXT NOT NULL DEFAULT '',
    "optionsJson" TEXT NOT NULL DEFAULT '[]',
    "correctIdx" INTEGER,
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "groundingType" TEXT NOT NULL DEFAULT 'source_supported',
    "groundingJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnReviewSchedule" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ladderStep" INTEGER NOT NULL DEFAULT 0,
    "intervalDays" INTEGER NOT NULL DEFAULT 1,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnReviewSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnReviewAttempt" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL DEFAULT false,
    "responseMs" INTEGER NOT NULL DEFAULT 0,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnReviewAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnProcessingJob" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "currentStage" TEXT NOT NULL DEFAULT 'source_created',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "stageStateJson" TEXT NOT NULL DEFAULT '{}',
    "pipelineVersion" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "BoardSection" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "IdeaSource" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'primary',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "mission" TEXT NOT NULL DEFAULT '',
    "pointOfView" TEXT NOT NULL DEFAULT '',
    "coreIdeasJson" TEXT NOT NULL DEFAULT '[]',
    "audience" TEXT NOT NULL DEFAULT '',
    "personality" TEXT NOT NULL DEFAULT '',
    "vocabularyJson" TEXT NOT NULL DEFAULT '[]',
    "toneTagsJson" TEXT NOT NULL DEFAULT '[]',
    "rhythm" TEXT NOT NULL DEFAULT '',
    "formatHabitsJson" TEXT NOT NULL DEFAULT '[]',
    "preferredJson" TEXT NOT NULL DEFAULT '[]',
    "avoidJson" TEXT NOT NULL DEFAULT '[]',
    "anchorStories" TEXT NOT NULL DEFAULT '',
    "writingSamples" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "sentenceLength" TEXT NOT NULL DEFAULT '',
    "formality" TEXT NOT NULL DEFAULT '',
    "directness" TEXT NOT NULL DEFAULT '',
    "hookType" TEXT NOT NULL DEFAULT '',
    "ctaType" TEXT NOT NULL DEFAULT '',
    "emojiPolicy" TEXT NOT NULL DEFAULT '',
    "punctuationStyle" TEXT NOT NULL DEFAULT '',
    "claimEvidencePolicy" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'personal',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceAttribution" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualStyleProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "brandColorsJson" TEXT NOT NULL DEFAULT '[]',
    "typography" TEXT NOT NULL DEFAULT '',
    "layoutPatternsJson" TEXT NOT NULL DEFAULT '[]',
    "aspectRatiosJson" TEXT NOT NULL DEFAULT '[]',
    "textDensity" TEXT NOT NULL DEFAULT '',
    "headlineLength" TEXT NOT NULL DEFAULT '',
    "imageStyle" TEXT NOT NULL DEFAULT '',
    "motifsJson" TEXT NOT NULL DEFAULT '[]',
    "ctaStyle" TEXT NOT NULL DEFAULT '',
    "forbiddenJson" TEXT NOT NULL DEFAULT '[]',
    "referencesJson" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisualStyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedPost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "draftQueueItemId" TEXT,
    "ideaId" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'x',
    "externalId" TEXT,
    "url" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceSnapshot" (
    "id" TEXT NOT NULL,
    "publishedPostId" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "normalizedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedViralTweet" (
    "id" TEXT NOT NULL,
    "channel" TEXT,
    "authorHandle" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "retweetCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "viralScore" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedViralTweet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentEmbedding" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "dim" INTEGER NOT NULL DEFAULT 0,
    "embeddingJson" TEXT NOT NULL DEFAULT '[]',
    "searchableDoc" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryFact" (
    "id" TEXT NOT NULL,
    "accountHandle" TEXT,
    "type" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "embeddingJson" TEXT,
    "embeddingModel" TEXT,
    "embeddingDims" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "sourceProvenance" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "tValid" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tInvalid" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "decayHalfLifeDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptionDna" (
    "id" TEXT NOT NULL,
    "accountHandle" TEXT NOT NULL,
    "openingHookTypes" TEXT NOT NULL DEFAULT '[]',
    "lengthRange" TEXT NOT NULL DEFAULT '{}',
    "sentenceRhythm" TEXT,
    "emojiPolicy" TEXT NOT NULL DEFAULT 'none',
    "ctaStyle" TEXT,
    "lineBreakPattern" TEXT,
    "signaturePhrases" TEXT NOT NULL DEFAULT '[]',
    "forbiddenPhrases" TEXT NOT NULL DEFAULT '[]',
    "toneVector" TEXT,
    "languageRegister" TEXT NOT NULL DEFAULT 'casual',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "provenance" TEXT NOT NULL DEFAULT 'operator',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaptionDna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesProfile" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "seriesKey" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT 'instagram',
    "purpose" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT '',
    "objective" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT 'carousel',
    "slideCountRange" TEXT NOT NULL DEFAULT '',
    "coverFormula" TEXT NOT NULL DEFAULT '',
    "slideArchetypesJson" TEXT NOT NULL DEFAULT '[]',
    "hierarchyNotes" TEXT NOT NULL DEFAULT '',
    "variableElementsJson" TEXT NOT NULL DEFAULT '[]',
    "ctaFormula" TEXT NOT NULL DEFAULT '',
    "visualStyleProfileId" TEXT,
    "voiceProfileId" TEXT,
    "captionDnaJson" TEXT NOT NULL DEFAULT '{}',
    "hashtagDnaJson" TEXT NOT NULL DEFAULT '[]',
    "pastTopicsJson" TEXT NOT NULL DEFAULT '[]',
    "bannedRepetitionJson" TEXT NOT NULL DEFAULT '[]',
    "productionChecklistJson" TEXT NOT NULL DEFAULT '[]',
    "evaluationRubricJson" TEXT NOT NULL DEFAULT '[]',
    "learnedRulesJson" TEXT NOT NULL DEFAULT '[]',
    "promptVersion" TEXT NOT NULL DEFAULT 'v1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeriesProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgWatchAccount" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT,
    "username" TEXT NOT NULL,
    "isInspiration" BOOLEAN NOT NULL DEFAULT false,
    "isCompetitor" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "probeStatus" TEXT NOT NULL DEFAULT 'pending',
    "probeError" TEXT NOT NULL DEFAULT '',
    "lastSyncAt" TIMESTAMP(3),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgWatchAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelDossier" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "pillar" TEXT NOT NULL DEFAULT '',
    "format" TEXT NOT NULL DEFAULT 'reel',
    "painPoint" TEXT NOT NULL DEFAULT '',
    "objective" TEXT NOT NULL DEFAULT '',
    "whyNow" TEXT NOT NULL DEFAULT '',
    "primaryToolJson" TEXT NOT NULL DEFAULT '{}',
    "verificationId" TEXT,
    "verificationEvidenceJson" TEXT NOT NULL DEFAULT '{}',
    "alternativesJson" TEXT NOT NULL DEFAULT '[]',
    "hook" TEXT NOT NULL DEFAULT '',
    "script" TEXT NOT NULL DEFAULT '',
    "timelineJson" TEXT NOT NULL DEFAULT '[]',
    "scenePlanJson" TEXT NOT NULL DEFAULT '[]',
    "screenRecordingPlanJson" TEXT NOT NULL DEFAULT '[]',
    "voiceover" TEXT NOT NULL DEFAULT '',
    "onScreenCopyJson" TEXT NOT NULL DEFAULT '[]',
    "cover" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtagGroupJson" TEXT NOT NULL DEFAULT '[]',
    "slidesJson" TEXT NOT NULL DEFAULT '[]',
    "assetChecklistJson" TEXT NOT NULL DEFAULT '[]',
    "productionEstimate" TEXT NOT NULL DEFAULT '',
    "expiry" TIMESTAMP(3),
    "risk" TEXT NOT NULL DEFAULT '',
    "finalReadiness" TEXT NOT NULL DEFAULT 'not_ready',
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelDossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelPlan" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "mixJson" TEXT NOT NULL DEFAULT '{}',
    "notesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelPlanSlot" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "pillar" TEXT NOT NULL DEFAULT '',
    "mixBucket" TEXT NOT NULL DEFAULT 'evergreen',
    "seriesKey" TEXT,
    "dossierId" TEXT,
    "topicHint" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelPlanSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteVerification" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "finalUrl" TEXT NOT NULL DEFAULT '',
    "opens" BOOLEAN NOT NULL DEFAULT false,
    "redirectChain" TEXT NOT NULL DEFAULT '[]',
    "evidenceJson" TEXT NOT NULL DEFAULT '{}',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HashtagDna" (
    "id" TEXT NOT NULL,
    "accountHandle" TEXT NOT NULL,
    "seriesId" TEXT,
    "coreTags" TEXT NOT NULL DEFAULT '[]',
    "rotatingTags" TEXT NOT NULL DEFAULT '[]',
    "tagCountRange" TEXT NOT NULL DEFAULT '{}',
    "placement" TEXT NOT NULL DEFAULT 'end',
    "casing" TEXT,
    "bannedTags" TEXT NOT NULL DEFAULT '[]',
    "perTagPerformance" TEXT NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "decayHalfLifeDays" INTEGER NOT NULL DEFAULT 45,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HashtagDna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "ipKey" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_handle_key" ON "Account"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "StyleProfile_accountId_key" ON "StyleProfile"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_accountId_handle_key" ON "Source"("accountId", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePost_tweetId_key" ON "SourcePost"("tweetId");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_accountId_key" ON "Schedule"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationRun_queueItemId_key" ON "GenerationRun"("queueItemId");

-- CreateIndex
CREATE INDEX "ViralPattern_platform_idx" ON "ViralPattern"("platform");

-- CreateIndex
CREATE INDEX "ViralPattern_validatedAt_idx" ON "ViralPattern"("validatedAt");

-- CreateIndex
CREATE INDEX "TrainingExample_platform_idx" ON "TrainingExample"("platform");

-- CreateIndex
CREATE INDEX "TrainingExample_seriesKey_idx" ON "TrainingExample"("seriesKey");

-- CreateIndex
CREATE INDEX "EvalTest_platform_idx" ON "EvalTest"("platform");

-- CreateIndex
CREATE INDEX "PipelineTrace_subjectType_subjectId_createdAt_idx" ON "PipelineTrace"("subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineTrace_createdAt_idx" ON "PipelineTrace"("createdAt");

-- CreateIndex
CREATE INDEX "CronRun_startedAt_idx" ON "CronRun"("startedAt");

-- CreateIndex
CREATE INDEX "CronRun_kind_startedAt_idx" ON "CronRun"("kind", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_feedUrl_key" ON "NewsSource"("feedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_url_key" ON "NewsItem"("url");

-- CreateIndex
CREATE INDEX "NewsItem_processingStatus_idx" ON "NewsItem"("processingStatus");

-- CreateIndex
CREATE INDEX "NewsItem_viralScore_idx" ON "NewsItem"("viralScore");

-- CreateIndex
CREATE INDEX "NewsItem_buzzScore_idx" ON "NewsItem"("buzzScore");

-- CreateIndex
CREATE INDEX "NewsItem_fetchedAt_idx" ON "NewsItem"("fetchedAt");

-- CreateIndex
CREATE INDEX "ContentOpportunity_status_idx" ON "ContentOpportunity"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RepoRadarItem_repoUrl_key" ON "RepoRadarItem"("repoUrl");

-- CreateIndex
CREATE INDEX "RepoRadarItem_status_idx" ON "RepoRadarItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ToolboxResource_url_key" ON "ToolboxResource"("url");

-- CreateIndex
CREATE INDEX "ToolboxResource_isActive_category_idx" ON "ToolboxResource"("isActive", "category");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_slug_key" ON "PromptTemplate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordEntry_slug_key" ON "KeywordEntry"("slug");

-- CreateIndex
CREATE INDEX "KeywordEntry_category_idx" ON "KeywordEntry"("category");

-- CreateIndex
CREATE UNIQUE INDEX "PromptFormula_code_key" ON "PromptFormula"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AiModelSnapshot_snapshotDate_key" ON "AiModelSnapshot"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyDigest_date_key" ON "DailyDigest"("date");

-- CreateIndex
CREATE UNIQUE INDEX "YtChannel_channelId_key" ON "YtChannel"("channelId");

-- CreateIndex
CREATE INDEX "YtChannel_enabled_isCompetitor_idx" ON "YtChannel"("enabled", "isCompetitor");

-- CreateIndex
CREATE INDEX "YtChannel_category_idx" ON "YtChannel"("category");

-- CreateIndex
CREATE UNIQUE INDEX "YtVideo_videoId_key" ON "YtVideo"("videoId");

-- CreateIndex
CREATE INDEX "YtVideo_outlierScore_idx" ON "YtVideo"("outlierScore");

-- CreateIndex
CREATE INDEX "YtVideo_status_idx" ON "YtVideo"("status");

-- CreateIndex
CREATE INDEX "YtVideo_channelId_publishedAt_idx" ON "YtVideo"("channelId", "publishedAt");

-- CreateIndex
CREATE INDEX "YtBrief_status_idx" ON "YtBrief"("status");

-- CreateIndex
CREATE INDEX "YtBrief_videoId_idx" ON "YtBrief"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "IgMedia_mediaId_key" ON "IgMedia"("mediaId");

-- CreateIndex
CREATE INDEX "IgMedia_postedAt_idx" ON "IgMedia"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IgComment_commentId_key" ON "IgComment"("commentId");

-- CreateIndex
CREATE INDEX "IgComment_status_idx" ON "IgComment"("status");

-- CreateIndex
CREATE INDEX "IgComment_priority_idx" ON "IgComment"("priority");

-- CreateIndex
CREATE INDEX "IgComment_mediaId_idx" ON "IgComment"("mediaId");

-- CreateIndex
CREATE INDEX "IgReplyDraft_commentId_idx" ON "IgReplyDraft"("commentId");

-- CreateIndex
CREATE INDEX "IgReplyDraft_status_idx" ON "IgReplyDraft"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_key_key" ON "IntegrationCredential"("key");

-- CreateIndex
CREATE UNIQUE INDEX "IgConversation_conversationId_key" ON "IgConversation"("conversationId");

-- CreateIndex
CREATE INDEX "IgConversation_lastMessageAt_idx" ON "IgConversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "IgMessage_messageId_key" ON "IgMessage"("messageId");

-- CreateIndex
CREATE INDEX "IgMessage_conversationId_idx" ON "IgMessage"("conversationId");

-- CreateIndex
CREATE INDEX "IgMessage_status_idx" ON "IgMessage"("status");

-- CreateIndex
CREATE INDEX "IgDmDraft_conversationId_idx" ON "IgDmDraft"("conversationId");

-- CreateIndex
CREATE INDEX "IgDmDraft_status_idx" ON "IgDmDraft"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IgInsightSnapshot_date_key" ON "IgInsightSnapshot"("date");

-- CreateIndex
CREATE INDEX "LearnSource_status_idx" ON "LearnSource"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LearnSource_kind_externalId_key" ON "LearnSource"("kind", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "LearnTranscript_sourceId_key" ON "LearnTranscript"("sourceId");

-- CreateIndex
CREATE INDEX "LearnChunk_sourceId_sectionIdx_idx" ON "LearnChunk"("sourceId", "sectionIdx");

-- CreateIndex
CREATE UNIQUE INDEX "LearnChunk_sourceId_idx_key" ON "LearnChunk"("sourceId", "idx");

-- CreateIndex
CREATE INDEX "LearnPack_status_idx" ON "LearnPack"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LearnPack_sourceId_pipelineVersion_key" ON "LearnPack"("sourceId", "pipelineVersion");

-- CreateIndex
CREATE INDEX "LearnConcept_packId_idx" ON "LearnConcept"("packId");

-- CreateIndex
CREATE INDEX "LearnItem_packId_kind_idx" ON "LearnItem"("packId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "LearnReviewSchedule_itemId_key" ON "LearnReviewSchedule"("itemId");

-- CreateIndex
CREATE INDEX "LearnReviewSchedule_dueAt_idx" ON "LearnReviewSchedule"("dueAt");

-- CreateIndex
CREATE INDEX "LearnReviewAttempt_itemId_reviewedAt_idx" ON "LearnReviewAttempt"("itemId", "reviewedAt");

-- CreateIndex
CREATE INDEX "LearnProcessingJob_status_currentStage_idx" ON "LearnProcessingJob"("status", "currentStage");

-- CreateIndex
CREATE UNIQUE INDEX "LearnProcessingJob_sourceId_pipelineVersion_key" ON "LearnProcessingJob"("sourceId", "pipelineVersion");

-- CreateIndex
CREATE INDEX "ContentItem_platform_format_idx" ON "ContentItem"("platform", "format");

-- CreateIndex
CREATE INDEX "ContentItem_creatorId_idx" ON "ContentItem"("creatorId");

-- CreateIndex
CREATE INDEX "ContentItem_analysisStatus_idx" ON "ContentItem"("analysisStatus");

-- CreateIndex
CREATE INDEX "ContentItem_publishedAt_idx" ON "ContentItem"("publishedAt");

-- CreateIndex
CREATE INDEX "ContentItem_originTable_originId_idx" ON "ContentItem"("originTable", "originId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_platform_externalId_key" ON "ContentItem"("platform", "externalId");

-- CreateIndex
CREATE INDEX "Creator_platform_idx" ON "Creator"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "Creator_platform_handle_key" ON "Creator"("platform", "handle");

-- CreateIndex
CREATE INDEX "CreatorBaseline_platform_format_idx" ON "CreatorBaseline"("platform", "format");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorBaseline_creatorId_format_metric_key" ON "CreatorBaseline"("creatorId", "format", "metric");

-- CreateIndex
CREATE INDEX "ContentOutlierScore_multiplier_idx" ON "ContentOutlierScore"("multiplier");

-- CreateIndex
CREATE UNIQUE INDEX "ContentOutlierScore_contentItemId_metric_key" ON "ContentOutlierScore"("contentItemId", "metric");

-- CreateIndex
CREATE INDEX "Board_accountId_idx" ON "Board"("accountId");

-- CreateIndex
CREATE INDEX "BoardSection_boardId_idx" ON "BoardSection"("boardId");

-- CreateIndex
CREATE INDEX "BoardItem_boardId_idx" ON "BoardItem"("boardId");

-- CreateIndex
CREATE INDEX "BoardItem_sectionId_idx" ON "BoardItem"("sectionId");

-- CreateIndex
CREATE INDEX "BoardItem_contentItemId_idx" ON "BoardItem"("contentItemId");

-- CreateIndex
CREATE INDEX "Idea_accountId_status_idx" ON "Idea"("accountId", "status");

-- CreateIndex
CREATE INDEX "Idea_platform_idx" ON "Idea"("platform");

-- CreateIndex
CREATE INDEX "IdeaSource_contentItemId_idx" ON "IdeaSource"("contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaSource_ideaId_contentItemId_key" ON "IdeaSource"("ideaId", "contentItemId");

-- CreateIndex
CREATE INDEX "VoiceProfile_accountId_isActive_idx" ON "VoiceProfile"("accountId", "isActive");

-- CreateIndex
CREATE INDEX "VisualStyleProfile_accountId_isActive_idx" ON "VisualStyleProfile"("accountId", "isActive");

-- CreateIndex
CREATE INDEX "PublishedPost_accountId_publishedAt_idx" ON "PublishedPost"("accountId", "publishedAt");

-- CreateIndex
CREATE INDEX "PublishedPost_platform_idx" ON "PublishedPost"("platform");

-- CreateIndex
CREATE INDEX "PerformanceSnapshot_publishedPostId_idx" ON "PerformanceSnapshot"("publishedPostId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceSnapshot_publishedPostId_window_key" ON "PerformanceSnapshot"("publishedPostId", "window");

-- CreateIndex
CREATE INDEX "SavedViralTweet_savedAt_idx" ON "SavedViralTweet"("savedAt");

-- CreateIndex
CREATE INDEX "SavedViralTweet_channel_idx" ON "SavedViralTweet"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "ContentEmbedding_contentItemId_key" ON "ContentEmbedding"("contentItemId");

-- CreateIndex
CREATE INDEX "ContentEmbedding_contentItemId_idx" ON "ContentEmbedding"("contentItemId");

-- CreateIndex
CREATE INDEX "MemoryFact_accountHandle_status_idx" ON "MemoryFact"("accountHandle", "status");

-- CreateIndex
CREATE INDEX "MemoryFact_type_status_idx" ON "MemoryFact"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CaptionDna_accountHandle_key" ON "CaptionDna"("accountHandle");

-- CreateIndex
CREATE INDEX "SeriesProfile_accountId_isActive_idx" ON "SeriesProfile"("accountId", "isActive");

-- CreateIndex
CREATE INDEX "SeriesProfile_seriesKey_idx" ON "SeriesProfile"("seriesKey");

-- CreateIndex
CREATE UNIQUE INDEX "IgWatchAccount_creatorId_key" ON "IgWatchAccount"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "IgWatchAccount_username_key" ON "IgWatchAccount"("username");

-- CreateIndex
CREATE INDEX "IgWatchAccount_probeStatus_idx" ON "IgWatchAccount"("probeStatus");

-- CreateIndex
CREATE INDEX "ReelDossier_accountId_createdAt_idx" ON "ReelDossier"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ReelDossier_finalReadiness_idx" ON "ReelDossier"("finalReadiness");

-- CreateIndex
CREATE UNIQUE INDEX "ReelPlan_accountId_month_key" ON "ReelPlan"("accountId", "month");

-- CreateIndex
CREATE INDEX "ReelPlanSlot_planId_dayOfMonth_idx" ON "ReelPlanSlot"("planId", "dayOfMonth");

-- CreateIndex
CREATE INDEX "WebsiteVerification_url_checkedAt_idx" ON "WebsiteVerification"("url", "checkedAt");

-- CreateIndex
CREATE INDEX "WebsiteVerification_expiry_idx" ON "WebsiteVerification"("expiry");

-- CreateIndex
CREATE UNIQUE INDEX "HashtagDna_accountHandle_seriesId_key" ON "HashtagDna"("accountHandle", "seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAttempt_ipKey_key" ON "AuthAttempt"("ipKey");

-- CreateIndex
CREATE INDEX "AuthAttempt_updatedAt_idx" ON "AuthAttempt"("updatedAt");

-- AddForeignKey
ALTER TABLE "StyleProfile" ADD CONSTRAINT "StyleProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePost" ADD CONSTRAINT "SourcePost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePost" ADD CONSTRAINT "SourcePost_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_sourcePostId_fkey" FOREIGN KEY ("sourcePostId") REFERENCES "SourcePost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanRun" ADD CONSTRAINT "ScanRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "QueueItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishLog" ADD CONSTRAINT "PublishLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViralPattern" ADD CONSTRAINT "ViralPattern_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExample" ADD CONSTRAINT "TrainingExample_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalTest" ADD CONSTRAINT "EvalTest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_newsSourceId_fkey" FOREIGN KEY ("newsSourceId") REFERENCES "NewsSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentOpportunity" ADD CONSTRAINT "ContentOpportunity_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentOpportunity" ADD CONSTRAINT "ContentOpportunity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YtVideo" ADD CONSTRAINT "YtVideo_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "YtChannel"("channelId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YtBrief" ADD CONSTRAINT "YtBrief_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "YtVideo"("videoId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgComment" ADD CONSTRAINT "IgComment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "IgMedia"("mediaId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgReplyDraft" ADD CONSTRAINT "IgReplyDraft_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "IgComment"("commentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgMessage" ADD CONSTRAINT "IgMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "IgConversation"("conversationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnTranscript" ADD CONSTRAINT "LearnTranscript_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LearnSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnChunk" ADD CONSTRAINT "LearnChunk_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "LearnTranscript"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnPack" ADD CONSTRAINT "LearnPack_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LearnSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnConcept" ADD CONSTRAINT "LearnConcept_packId_fkey" FOREIGN KEY ("packId") REFERENCES "LearnPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnItem" ADD CONSTRAINT "LearnItem_packId_fkey" FOREIGN KEY ("packId") REFERENCES "LearnPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnItem" ADD CONSTRAINT "LearnItem_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "LearnConcept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnReviewSchedule" ADD CONSTRAINT "LearnReviewSchedule_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnReviewAttempt" ADD CONSTRAINT "LearnReviewAttempt_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearnItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnProcessingJob" ADD CONSTRAINT "LearnProcessingJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LearnSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorBaseline" ADD CONSTRAINT "CreatorBaseline_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentOutlierScore" ADD CONSTRAINT "ContentOutlierScore_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardSection" ADD CONSTRAINT "BoardSection_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardItem" ADD CONSTRAINT "BoardItem_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardItem" ADD CONSTRAINT "BoardItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "BoardSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardItem" ADD CONSTRAINT "BoardItem_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaSource" ADD CONSTRAINT "IdeaSource_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaSource" ADD CONSTRAINT "IdeaSource_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceSnapshot" ADD CONSTRAINT "PerformanceSnapshot_publishedPostId_fkey" FOREIGN KEY ("publishedPostId") REFERENCES "PublishedPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentEmbedding" ADD CONSTRAINT "ContentEmbedding_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelPlanSlot" ADD CONSTRAINT "ReelPlanSlot_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ReelPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
