-- AlterTable
ALTER TABLE "ContestProblem" ADD COLUMN     "remoteProblemId" TEXT;

-- AddForeignKey
ALTER TABLE "ContestProblem" ADD CONSTRAINT "ContestProblem_remoteProblemId_fkey" FOREIGN KEY ("remoteProblemId") REFERENCES "RemoteProblem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
