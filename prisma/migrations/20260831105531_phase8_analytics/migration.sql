-- CreateTable
CREATE TABLE "UserTagStat" (
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "attempted" INTEGER NOT NULL DEFAULT 0,
    "solved" INTEGER NOT NULL DEFAULT 0,
    "mastery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgAttemptsToAc" DOUBLE PRECISION,
    "lastSolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTagStat_pkey" PRIMARY KEY ("userId","tagId")
);

-- CreateTable
CREATE TABLE "SectionStat" (
    "sectionId" TEXT NOT NULL,
    "activeStudents" INTEGER NOT NULL DEFAULT 0,
    "medianSolved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weakTags" JSONB NOT NULL DEFAULT '[]',
    "atRisk" JSONB NOT NULL DEFAULT '[]',
    "atRiskUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionStat_pkey" PRIMARY KEY ("sectionId")
);

-- CreateTable
CREATE TABLE "UserDailyStat" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "submitted" INTEGER NOT NULL DEFAULT 0,
    "solved" INTEGER NOT NULL DEFAULT 0,
    "minutesActive" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDailyStat_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "AnalyticsWatermark" (
    "job" TEXT NOT NULL,
    "cursorAt" TIMESTAMP(3),
    "cursorId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsWatermark_pkey" PRIMARY KEY ("job")
);

-- CreateIndex
CREATE INDEX "UserTagStat_tagId_mastery_idx" ON "UserTagStat"("tagId", "mastery");

-- CreateIndex
CREATE INDEX "UserDailyStat_day_idx" ON "UserDailyStat"("day");

-- AddForeignKey
ALTER TABLE "UserTagStat" ADD CONSTRAINT "UserTagStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTagStat" ADD CONSTRAINT "UserTagStat_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionStat" ADD CONSTRAINT "SectionStat_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDailyStat" ADD CONSTRAINT "UserDailyStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
