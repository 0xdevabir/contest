-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "payloadKey" TEXT;

-- CreateTable
CREATE TABLE "SubmissionPayload" (
    "submissionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stdout" TEXT,
    "stderr" TEXT,
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionPayload_pkey" PRIMARY KEY ("submissionId")
);

-- CreateTable
CREATE TABLE "LeaderboardCache" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "LeaderboardCache_computedAt_idx" ON "LeaderboardCache"("computedAt");

-- AddForeignKey
ALTER TABLE "SubmissionPayload" ADD CONSTRAINT "SubmissionPayload_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
