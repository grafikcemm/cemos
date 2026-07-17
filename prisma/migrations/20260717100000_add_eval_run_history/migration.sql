-- Faz 2E (ADR-034): kalıcı eval koşu geçmişi + trace kapsama indeksi.
-- Additive-only: iki yeni tablo + bir yeni indeks. DROP/TRUNCATE/destructive ALTER yok.

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "model" TEXT,
    "preset" TEXT,
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "policyVersion" TEXT NOT NULL DEFAULT '',
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "errorClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalCaseResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseKey" TEXT NOT NULL,
    "fixtureId" TEXT,
    "agentId" TEXT,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "traceStatus" TEXT NOT NULL DEFAULT 'not_applicable',
    "detailsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalCaseResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvalRun_kind_startedAt_idx" ON "EvalRun"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "EvalRun_status_startedAt_idx" ON "EvalRun"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvalCaseResult_runId_caseKey_key" ON "EvalCaseResult"("runId", "caseKey");

-- CreateIndex
CREATE INDEX "EvalCaseResult_agentId_createdAt_idx" ON "EvalCaseResult"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineTrace_pipelineId_createdAt_idx" ON "PipelineTrace"("pipelineId", "createdAt");

-- AddForeignKey
ALTER TABLE "EvalCaseResult" ADD CONSTRAINT "EvalCaseResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EvalRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
