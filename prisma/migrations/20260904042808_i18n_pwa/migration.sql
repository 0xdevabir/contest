-- Phase 14 — Localization, Accessibility & PWA. Purely additive.

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka';

-- AlterTable
ALTER TABLE "ProblemVersion"
  ADD COLUMN "titleBn" TEXT,
  ADD COLUMN "inputSpecBn" TEXT,
  ADD COLUMN "outputSpecBn" TEXT,
  ADD COLUMN "constraintsBn" TEXT,
  ADD COLUMN "bnApprovedById" TEXT,
  ADD COLUMN "bnApprovedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Submission"
  ADD COLUMN "clientRequestId" TEXT;

-- CreateIndex
-- Postgres treats each NULL as distinct, so existing/online submissions
-- (clientRequestId = NULL) never collide with each other.
CREATE UNIQUE INDEX "Submission_userId_clientRequestId_key" ON "Submission"("userId", "clientRequestId");
