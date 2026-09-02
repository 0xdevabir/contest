-- CreateEnum
CREATE TYPE "ParticipationMode" AS ENUM ('LIVE', 'VIRTUAL', 'PRACTICE');

-- CreateEnum
CREATE TYPE "ContestVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'INSTITUTION', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ContestJoinPolicy" AS ENUM ('OPEN', 'CODE', 'PASSWORD', 'ROSTER', 'INVITE', 'STAFF_ONLY');

-- CreateEnum
CREATE TYPE "ContestRole" AS ENUM ('OWNER', 'COAUTHOR', 'JUDGE', 'OBSERVER');

-- AlterTable
ALTER TABLE "Contest" ADD COLUMN     "clonedFromId" TEXT,
ADD COLUMN     "institutionId" TEXT,
ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "joinCode" TEXT,
ADD COLUMN     "joinPasswordHash" TEXT,
ADD COLUMN     "joinPolicy" "ContestJoinPolicy" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "participantCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sectionId" TEXT,
ADD COLUMN     "visibility" "ContestVisibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "participationId" TEXT;

-- CreateTable
CREATE TABLE "ContestStaff" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ContestRole" NOT NULL DEFAULT 'JUDGE',
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestParticipation" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "mode" "ParticipationMode" NOT NULL DEFAULT 'LIVE',
    "official" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredAt" TIMESTAMP(3),

    CONSTRAINT "ContestParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestStandingSnapshot" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "standings" JSONB NOT NULL,
    "problemStats" JSONB NOT NULL DEFAULT '{}',
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestStandingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContestStaff_userId_idx" ON "ContestStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestStaff_contestId_userId_key" ON "ContestStaff"("contestId", "userId");

-- CreateIndex
CREATE INDEX "ContestParticipation_contestId_mode_official_idx" ON "ContestParticipation"("contestId", "mode", "official");

-- CreateIndex
CREATE INDEX "ContestParticipation_userId_mode_idx" ON "ContestParticipation"("userId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "ContestParticipation_contestId_userId_mode_key" ON "ContestParticipation"("contestId", "userId", "mode");

-- CreateIndex
CREATE INDEX "ContestStandingSnapshot_contestId_createdAt_idx" ON "ContestStandingSnapshot"("contestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContestStandingSnapshot_contestId_version_key" ON "ContestStandingSnapshot"("contestId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Contest_joinCode_key" ON "Contest"("joinCode");

-- CreateIndex
CREATE INDEX "Contest_visibility_status_startsAt_idx" ON "Contest"("visibility", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Contest_institutionId_status_idx" ON "Contest"("institutionId", "status");

-- CreateIndex
CREATE INDEX "Contest_sectionId_idx" ON "Contest"("sectionId");

-- CreateIndex
CREATE INDEX "Submission_participationId_createdAt_idx" ON "Submission"("participationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_clonedFromId_fkey" FOREIGN KEY ("clonedFromId") REFERENCES "Contest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestStaff" ADD CONSTRAINT "ContestStaff_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestStaff" ADD CONSTRAINT "ContestStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestStaff" ADD CONSTRAINT "ContestStaff_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestParticipation" ADD CONSTRAINT "ContestParticipation_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestParticipation" ADD CONSTRAINT "ContestParticipation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestStandingSnapshot" ADD CONSTRAINT "ContestStandingSnapshot_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestStandingSnapshot" ADD CONSTRAINT "ContestStandingSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_participationId_fkey" FOREIGN KEY ("participationId") REFERENCES "ContestParticipation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

