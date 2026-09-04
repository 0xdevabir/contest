-- CreateEnum
CREATE TYPE "AiJobKind" AS ENUM ('TESTGEN', 'EDITORIAL', 'VARIANT', 'HINT', 'TRANSLATE', 'RECOMMEND');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED');

-- Note: prisma migrate diff also proposed dropping Problem_searchVector_idx,
-- Problem_title_trgm_idx, ProblemVersion_statementSearchVector_idx and an
-- ALTER on Problem.searchVector's DEFAULT — those are pre-existing drift
-- against the hand-written Phase 13 FTS migration (Unsupported("tsvector")
-- columns Prisma can't fully model), not part of this change. Deliberately
-- omitted; see prisma/migrations/20260903181100_phase13_search_fts.

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "kind" "AiJobKind" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "institutionId" TEXT,
    "inputHash" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "accepted" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudget" (
    "institutionId" TEXT NOT NULL,
    "monthlyCents" DOUBLE PRECISION NOT NULL DEFAULT 2000,
    "usedCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "hardStop" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AiBudget_pkey" PRIMARY KEY ("institutionId")
);

-- CreateTable
CREATE TABLE "ProblemRecommendation" (
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemRecommendation_pkey" PRIMARY KEY ("userId","problemId")
);

-- CreateTable
CREATE TABLE "HintRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "submissionId" TEXT,
    "level" INTEGER NOT NULL,
    "hint" TEXT NOT NULL,
    "helpful" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HintRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiJob_kind_status_createdAt_idx" ON "AiJob"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AiJob_inputHash_idx" ON "AiJob"("inputHash");

-- CreateIndex
CREATE INDEX "AiJob_institutionId_createdAt_idx" ON "AiJob"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "ProblemRecommendation_userId_score_idx" ON "ProblemRecommendation"("userId", "score");

-- CreateIndex
CREATE INDEX "HintRequest_userId_problemId_idx" ON "HintRequest"("userId", "problemId");
