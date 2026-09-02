-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxCpuMs" INTEGER,
ADD COLUMN     "maxWallMs" INTEGER,
ADD COLUMN     "maxMemoryKb" INTEGER,
ADD COLUMN     "compileMs" INTEGER,
ADD COLUMN     "judgeImage" TEXT,
ADD COLUMN     "judgeProtocol" INTEGER NOT NULL DEFAULT 1;

-- Backfill: pre-Phase-3 rows sort sensibly alongside new scored ones.
UPDATE "Submission" SET "score" = 100, "maxScore" = 100 WHERE "verdict" = 'AC';
UPDATE "Submission" SET "maxScore" = 100 WHERE "verdict" != 'AC';
