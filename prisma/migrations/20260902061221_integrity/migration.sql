-- CreateTable
CREATE TABLE "UserRating" (
    "userId" TEXT NOT NULL,
    "mu" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "sigma" DOUBLE PRECISION NOT NULL DEFAULT 350,
    "displayed" INTEGER NOT NULL DEFAULT 800,
    "peak" INTEGER NOT NULL DEFAULT 800,
    "contests" INTEGER NOT NULL DEFAULT 0,
    "lastContestAt" TIMESTAMP(3),
    "engineVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UserRating_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RatingEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "ratedCount" INTEGER NOT NULL,
    "muBefore" DOUBLE PRECISION NOT NULL,
    "sigmaBefore" DOUBLE PRECISION NOT NULL,
    "muAfter" DOUBLE PRECISION NOT NULL,
    "sigmaAfter" DOUBLE PRECISION NOT NULL,
    "displayedBefore" INTEGER NOT NULL,
    "displayedAfter" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "engineVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "institutionId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonStanding" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "ratingGain" INTEGER NOT NULL,
    "solved" INTEGER NOT NULL,
    "contests" INTEGER NOT NULL,

    CONSTRAINT "SeasonStanding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'bronze',
    "rule" JSONB NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("userId","badgeId")
);

-- CreateTable
CREATE TABLE "UserStreak" (
    "userId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "lastSolveDay" DATE,
    "freezes" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',

    CONSTRAINT "UserStreak_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ProblemRating" (
    "problemId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "solvedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemRating_pkey" PRIMARY KEY ("problemId")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contestId" TEXT,
    "sectionId" TEXT,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionFingerprint" (
    "submissionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "hashes" TEXT[],
    "tokenCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionFingerprint_pkey" PRIMARY KEY ("submissionId")
);

-- CreateTable
CREATE TABLE "FingerprintIndex" (
    "hash" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "FingerprintIndex_pkey" PRIMARY KEY ("hash","submissionId")
);

-- CreateTable
CREATE TABLE "SimilarityPair" (
    "id" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "submissionAId" TEXT NOT NULL,
    "submissionBId" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "zScore" DOUBLE PRECISION NOT NULL,
    "sharedTokens" INTEGER NOT NULL,
    "regions" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimilarityPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProctorEvent" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "participationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ProctorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemVariantTemplate" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "statementTemplate" TEXT NOT NULL,
    "parameterSpec" JSONB NOT NULL,
    "generatorSource" TEXT NOT NULL,
    "generatorLang" TEXT NOT NULL DEFAULT 'cpp20',
    "referenceSource" TEXT NOT NULL,
    "referenceLang" TEXT NOT NULL DEFAULT 'cpp20',
    "testPlan" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemVariantTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemVariant" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "problemVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrityReport" (
    "id" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "IntegrityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRating_displayed_idx" ON "UserRating"("displayed");

-- CreateIndex
CREATE INDEX "RatingEvent_contestId_idx" ON "RatingEvent"("contestId");

-- CreateIndex
CREATE INDEX "RatingEvent_userId_createdAt_idx" ON "RatingEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RatingEvent_userId_contestId_key" ON "RatingEvent"("userId", "contestId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_slug_key" ON "Season"("slug");

-- CreateIndex
CREATE INDEX "Season_institutionId_endsAt_idx" ON "Season"("institutionId", "endsAt");

-- CreateIndex
CREATE INDEX "SeasonStanding_seasonId_rank_idx" ON "SeasonStanding"("seasonId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonStanding_seasonId_userId_key" ON "SeasonStanding"("seasonId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");

-- CreateIndex
CREATE INDEX "UserBadge_badgeId_idx" ON "UserBadge"("badgeId");

-- CreateIndex
CREATE INDEX "ProblemRating_rating_idx" ON "ProblemRating"("rating");

-- CreateIndex
CREATE INDEX "Certificate_userId_type_idx" ON "Certificate"("userId", "type");

-- CreateIndex
CREATE INDEX "FingerprintIndex_problemId_hash_idx" ON "FingerprintIndex"("problemId", "hash");

-- CreateIndex
CREATE INDEX "SimilarityPair_scopeType_scopeId_zScore_idx" ON "SimilarityPair"("scopeType", "scopeId", "zScore");

-- CreateIndex
CREATE INDEX "SimilarityPair_userAId_idx" ON "SimilarityPair"("userAId");

-- CreateIndex
CREATE INDEX "SimilarityPair_userBId_idx" ON "SimilarityPair"("userBId");

-- CreateIndex
CREATE UNIQUE INDEX "SimilarityPair_scopeType_scopeId_submissionAId_submissionBI_key" ON "SimilarityPair"("scopeType", "scopeId", "submissionAId", "submissionBId");

-- CreateIndex
CREATE INDEX "ProctorEvent_contestId_userId_at_idx" ON "ProctorEvent"("contestId", "userId", "at");

-- CreateIndex
CREATE INDEX "ProctorEvent_participationId_idx" ON "ProctorEvent"("participationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemVariantTemplate_problemId_key" ON "ProblemVariantTemplate"("problemId");

-- CreateIndex
CREATE INDEX "ProblemVariantTemplate_createdById_idx" ON "ProblemVariantTemplate"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemVariant_problemVersionId_key" ON "ProblemVariant"("problemVersionId");

-- CreateIndex
CREATE INDEX "ProblemVariant_scopeId_idx" ON "ProblemVariant"("scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemVariant_templateId_userId_scopeId_key" ON "ProblemVariant"("templateId", "userId", "scopeId");

-- CreateIndex
CREATE INDEX "IntegrityReport_scopeType_scopeId_idx" ON "IntegrityReport"("scopeType", "scopeId");

-- AddForeignKey
ALTER TABLE "UserRating" ADD CONSTRAINT "UserRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingEvent" ADD CONSTRAINT "RatingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingEvent" ADD CONSTRAINT "RatingEvent_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonStanding" ADD CONSTRAINT "SeasonStanding_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonStanding" ADD CONSTRAINT "SeasonStanding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStreak" ADD CONSTRAINT "UserStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemRating" ADD CONSTRAINT "ProblemRating_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFingerprint" ADD CONSTRAINT "SubmissionFingerprint_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FingerprintIndex" ADD CONSTRAINT "FingerprintIndex_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimilarityPair" ADD CONSTRAINT "SimilarityPair_submissionAId_fkey" FOREIGN KEY ("submissionAId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimilarityPair" ADD CONSTRAINT "SimilarityPair_submissionBId_fkey" FOREIGN KEY ("submissionBId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimilarityPair" ADD CONSTRAINT "SimilarityPair_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimilarityPair" ADD CONSTRAINT "SimilarityPair_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimilarityPair" ADD CONSTRAINT "SimilarityPair_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctorEvent" ADD CONSTRAINT "ProctorEvent_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctorEvent" ADD CONSTRAINT "ProctorEvent_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "ContestParticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctorEvent" ADD CONSTRAINT "ProctorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVariantTemplate" ADD CONSTRAINT "ProblemVariantTemplate_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVariantTemplate" ADD CONSTRAINT "ProblemVariantTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVariant" ADD CONSTRAINT "ProblemVariant_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProblemVariantTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVariant" ADD CONSTRAINT "ProblemVariant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVariant" ADD CONSTRAINT "ProblemVariant_problemVersionId_fkey" FOREIGN KEY ("problemVersionId") REFERENCES "ProblemVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrityReport" ADD CONSTRAINT "IntegrityReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
