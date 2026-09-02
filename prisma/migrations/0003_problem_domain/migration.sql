-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('VERY EASY', 'EASY', 'MEDIUM', 'MEDIUM-HARD', 'HARD', 'VERY HARD', 'EXTREME');

-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProblemVisibility" AS ENUM ('PUBLIC', 'INSTITUTION', 'PRIVATE');

-- CreateEnum
CREATE TYPE "CheckerType" AS ENUM ('EXACT', 'TOKEN', 'FLOAT', 'SPECIAL', 'INTERACTIVE');

-- AlterTable
ALTER TABLE "ContestProblem" ADD COLUMN     "problemRefId" TEXT,
ADD COLUMN     "problemVersionId" TEXT;

-- AlterTable
ALTER TABLE "SolvedProblem" ADD COLUMN     "problemRefId" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "problemRefId" TEXT,
ADD COLUMN     "problemVersionId" TEXT;

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProblemStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "ProblemVisibility" NOT NULL DEFAULT 'PRIVATE',
    "authorId" TEXT NOT NULL,
    "institutionId" TEXT,
    "currentVersionId" TEXT,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'EASY',
    "legacySet" INTEGER,
    "legacyQuestion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemVersion" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "statementMd" TEXT NOT NULL,
    "statementBn" TEXT,
    "inputSpec" TEXT NOT NULL DEFAULT '',
    "outputSpec" TEXT NOT NULL DEFAULT '',
    "constraints" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "starterCode" JSONB NOT NULL DEFAULT '{}',
    "timeLimitMs" INTEGER NOT NULL DEFAULT 2000,
    "memoryLimitMb" INTEGER NOT NULL DEFAULT 256,
    "outputLimitKb" INTEGER NOT NULL DEFAULT 512,
    "checkerType" "CheckerType" NOT NULL DEFAULT 'TOKEN',
    "checkerEps" DOUBLE PRECISION,
    "checkerCode" TEXT,
    "checkerLang" TEXT,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ProblemVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestGroup" (
    "id" TEXT NOT NULL,
    "problemVersionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL DEFAULT 'main',
    "points" INTEGER NOT NULL DEFAULT 100,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "dependsOn" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "stopOnFail" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TestGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "testGroupId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL DEFAULT '',
    "inputKey" TEXT,
    "expectedKey" TEXT,
    "inputInline" TEXT,
    "expectedInline" TEXT,
    "inputHash" TEXT NOT NULL,
    "expectedHash" TEXT NOT NULL,
    "inputBytes" INTEGER NOT NULL DEFAULT 0,
    "expectedBytes" INTEGER NOT NULL DEFAULT 0,
    "manualExpected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceSolution" (
    "id" TEXT NOT NULL,
    "problemVersionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "expectedVerdict" "Verdict" NOT NULL DEFAULT 'AC',
    "note" TEXT NOT NULL DEFAULT '',
    "lastVerdict" "Verdict",
    "lastCheckedAt" TIMESTAMP(3),
    "lastMaxCpuMs" INTEGER,

    CONSTRAINT "ReferenceSolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "category" TEXT NOT NULL DEFAULT 'topic',
    "spoiler" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemTag" (
    "problemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "ProblemTag_pkey" PRIMARY KEY ("problemId","tagId")
);

-- CreateTable
CREATE TABLE "ProblemStats" (
    "problemId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "distinctUsers" INTEGER NOT NULL DEFAULT 0,
    "distinctSolvers" INTEGER NOT NULL DEFAULT 0,
    "eloDifficulty" INTEGER,
    "avgAttemptsToAc" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemStats_pkey" PRIMARY KEY ("problemId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Problem_slug_key" ON "Problem"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_currentVersionId_key" ON "Problem"("currentVersionId");

-- CreateIndex
CREATE INDEX "Problem_status_visibility_difficulty_idx" ON "Problem"("status", "visibility", "difficulty");

-- CreateIndex
CREATE INDEX "Problem_authorId_status_idx" ON "Problem"("authorId", "status");

-- CreateIndex
CREATE INDEX "Problem_institutionId_idx" ON "Problem"("institutionId");

-- CreateIndex
CREATE INDEX "ProblemVersion_problemId_frozen_idx" ON "ProblemVersion"("problemId", "frozen");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemVersion_problemId_version_key" ON "ProblemVersion"("problemId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TestGroup_problemVersionId_order_key" ON "TestGroup"("problemVersionId", "order");

-- CreateIndex
CREATE INDEX "TestCase_inputHash_idx" ON "TestCase"("inputHash");

-- CreateIndex
CREATE UNIQUE INDEX "TestCase_testGroupId_order_key" ON "TestCase"("testGroupId", "order");

-- CreateIndex
CREATE INDEX "ReferenceSolution_problemVersionId_idx" ON "ReferenceSolution"("problemVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_category_idx" ON "Tag"("category");

-- CreateIndex
CREATE INDEX "ProblemTag_tagId_idx" ON "ProblemTag"("tagId");

-- CreateIndex
CREATE INDEX "ProblemStats_accepted_idx" ON "ProblemStats"("accepted");

-- CreateIndex
CREATE INDEX "ContestProblem_problemRefId_idx" ON "ContestProblem"("problemRefId");

-- CreateIndex
CREATE INDEX "ContestProblem_problemVersionId_idx" ON "ContestProblem"("problemVersionId");

-- CreateIndex
CREATE INDEX "SolvedProblem_problemRefId_idx" ON "SolvedProblem"("problemRefId");

-- CreateIndex
CREATE INDEX "Submission_problemRefId_verdict_idx" ON "Submission"("problemRefId", "verdict");

-- AddForeignKey
ALTER TABLE "ContestProblem" ADD CONSTRAINT "ContestProblem_problemRefId_fkey" FOREIGN KEY ("problemRefId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestProblem" ADD CONSTRAINT "ContestProblem_problemVersionId_fkey" FOREIGN KEY ("problemVersionId") REFERENCES "ProblemVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_problemRefId_fkey" FOREIGN KEY ("problemRefId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolvedProblem" ADD CONSTRAINT "SolvedProblem_problemRefId_fkey" FOREIGN KEY ("problemRefId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ProblemVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVersion" ADD CONSTRAINT "ProblemVersion_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestGroup" ADD CONSTRAINT "TestGroup_problemVersionId_fkey" FOREIGN KEY ("problemVersionId") REFERENCES "ProblemVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_testGroupId_fkey" FOREIGN KEY ("testGroupId") REFERENCES "TestGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceSolution" ADD CONSTRAINT "ReferenceSolution_problemVersionId_fkey" FOREIGN KEY ("problemVersionId") REFERENCES "ProblemVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemTag" ADD CONSTRAINT "ProblemTag_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemTag" ADD CONSTRAINT "ProblemTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemStats" ADD CONSTRAINT "ProblemStats_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

