-- Phase 13 Part 3 — Postgres full-text + trigram search
-- Hand-written (Prisma cannot model generated/trigger-maintained columns).
-- See docs/phases/PHASE-13-scale-ops.md Part 3 and src/lib/search.ts.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Problem: title (weight A) + slug (weight B), always in sync via GENERATED.
ALTER TABLE "Problem"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("slug", '')), 'B')
  ) STORED;

CREATE INDEX "Problem_searchVector_idx" ON "Problem" USING GIN ("searchVector");

-- Trigram fallback for typo/transliteration-tolerant title matching.
CREATE INDEX "Problem_title_trgm_idx" ON "Problem" USING GIN ("title" gin_trgm_ops);

-- ProblemVersion: statement text search. Not a GENERATED column because only
-- the *current* version (Problem.currentVersionId) should be searched, which
-- ProblemVersion cannot determine about itself — a trigger keeps it in sync
-- with statementMd/statementBn instead.
ALTER TABLE "ProblemVersion" ADD COLUMN "statementSearchVector" tsvector;

CREATE INDEX "ProblemVersion_statementSearchVector_idx"
  ON "ProblemVersion" USING GIN ("statementSearchVector");

CREATE OR REPLACE FUNCTION problem_version_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."statementSearchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."statementMd", '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW."statementBn", '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER problem_version_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "statementMd", "statementBn" ON "ProblemVersion"
  FOR EACH ROW EXECUTE FUNCTION problem_version_search_vector_update();

-- Backfill existing rows (no-op on a fresh/empty table).
UPDATE "ProblemVersion" SET "statementMd" = "statementMd";
