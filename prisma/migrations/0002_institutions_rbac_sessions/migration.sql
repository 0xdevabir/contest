-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('PUBLIC_UNIVERSITY', 'PRIVATE_UNIVERSITY', 'NATIONAL_UNIVERSITY_COLLEGE', 'POLYTECHNIC', 'COLLEGE', 'SCHOOL', 'OTHER');

-- AlterEnum
-- InstitutionDomain does not exist yet at this point in the migration (it is
-- created further down), so there is no pre-existing "roleHint" column to
-- migrate onto the new Role type.
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('STUDENT', 'TEACHER', 'TA', 'ADMIN');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STUDENT';
COMMIT;

-- DropIndex
DROP INDEX "User_university_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "university",
ADD COLUMN     "institutionId" TEXT,
ADD COLUMN     "institutionVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "institutionVerifiedBy" TEXT,
ADD COLUMN     "teacherApprovedAt" TIMESTAMP(3),
ADD COLUMN     "teacherApprovedBy" TEXT,
ADD COLUMN     "teacherRequestNote" TEXT DEFAULT '',
ALTER COLUMN "role" SET DEFAULT 'STUDENT';

-- DropEnum
DROP TYPE "University";

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "type" "InstitutionType" NOT NULL DEFAULT 'PRIVATE_UNIVERSITY',
    "district" TEXT,
    "division" TEXT,
    "websiteUrl" TEXT,
    "logoUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "solvedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionDomain" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "roleHint" "Role",

    CONSTRAINT "InstitutionDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "boundContestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_slug_key" ON "Institution"("slug");

-- CreateIndex
CREATE INDEX "Institution_verified_memberCount_idx" ON "Institution"("verified", "memberCount");

-- CreateIndex
CREATE INDEX "Institution_district_idx" ON "Institution"("district");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionDomain_domain_key" ON "InstitutionDomain"("domain");

-- CreateIndex
CREATE INDEX "InstitutionDomain_institutionId_idx" ON "InstitutionDomain"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "User_institutionId_institutionVerifiedAt_idx" ON "User"("institutionId", "institutionVerifiedAt");

-- CreateIndex
CREATE INDEX "User_role_teacherApprovedAt_idx" ON "User"("role", "teacherApprovedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionDomain" ADD CONSTRAINT "InstitutionDomain_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

