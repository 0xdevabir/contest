-- Phase 4 — Judge Queue (docs/phases/DONE__PHASE-04-judge-queue.md)
-- Expand-only: `state` defaults to DONE so every existing row is already
-- correct with no backfill.

-- CreateEnum
CREATE TYPE "SubmissionState" AS ENUM ('QUEUED', 'JUDGING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedBy" TEXT,
ADD COLUMN     "heartbeatAt" TIMESTAMP(3),
ADD COLUMN     "judgedAt" TIMESTAMP(3),
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "queuedAt" TIMESTAMP(3),
ADD COLUMN     "rejudgeBatchId" TEXT,
ADD COLUMN     "shadowReport" JSONB,
ADD COLUMN     "state" "SubmissionState" NOT NULL DEFAULT 'DONE';

-- CreateTable
CREATE TABLE "RejudgeBatch" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "changed" INTEGER NOT NULL DEFAULT 0,
    "diffSummary" JSONB NOT NULL DEFAULT '{}',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejudgeBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeWorker" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "languages" TEXT[],
    "concurrency" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "judgedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JudgeWorker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RejudgeBatch_scope_scopeId_idx" ON "RejudgeBatch"("scope", "scopeId");

-- CreateIndex
CREATE INDEX "JudgeWorker_lastSeenAt_idx" ON "JudgeWorker"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Submission_state_priority_queuedAt_idx" ON "Submission"("state", "priority", "queuedAt");

-- CreateIndex
CREATE INDEX "Submission_state_heartbeatAt_idx" ON "Submission"("state", "heartbeatAt");

-- CreateIndex
CREATE INDEX "Submission_rejudgeBatchId_idx" ON "Submission"("rejudgeBatchId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_rejudgeBatchId_fkey" FOREIGN KEY ("rejudgeBatchId") REFERENCES "RejudgeBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RejudgeBatch" ADD CONSTRAINT "RejudgeBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
