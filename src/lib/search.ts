import { prisma } from "./db";

/**
 * Phase 13 Part 3 — Postgres full-text + trigram search (docs/phases/
 * PHASE-13-scale-ops.md Part 3). `Problem.searchVector` (GENERATED, English
 * title weight A / simple slug weight B) and `ProblemVersion
 * .statementSearchVector` (trigger-maintained) are added by the hand-written
 * migration at prisma/migrations/20260903181100_phase13_search_fts —
 * `pg_trgm` is enabled there too. Contest and User have no generated tsvector
 * column (out of scope this session, per the phase plan) — those two use a
 * plain `ILIKE` + trigram `similarity()` query instead.
 *
 * Visibility: only PUBLISHED + PUBLIC problems are searchable, matching
 * `PUBLIC_WHERE` in src/lib/problems.ts (the open-archive gate).
 */

export type ProblemSearchHit = {
  type: "problem";
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  rank: number;
};

export type ContestSearchHit = {
  type: "contest";
  id: string;
  slug: string;
  title: string;
  rank: number;
};

export type UserSearchHit = {
  type: "user";
  id: string;
  name: string;
  rank: number;
};

export type SearchHit = ProblemSearchHit | ContestSearchHit | UserSearchHit;

/**
 * Ranked by `ts_rank` against the generated tsvector (English title weight A
 * beats slug weight B, so an exact title match always outranks a partial
 * one), UNIONed with a trigram-similarity pass over `title` for typo/
 * transliteration tolerance — a query that misses the tsquery entirely (a
 * typo) can still surface via `similarity`. Deduplicated by problem id,
 * keeping the best rank of the two passes.
 */
export async function searchProblems(query: string, limit = 10): Promise<ProblemSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const rows = await prisma.$queryRaw<
    Array<{ id: string; slug: string; title: string; difficulty: string; rank: number }>
  >`
    WITH fts AS (
      -- Normalization flag 2 (rank / document length) so a concise exact
      -- title match outranks a longer title that merely contains the same
      -- terms — "document length" here is the title+slug tsvector, so a
      -- shorter, more exact title wins.
      SELECT p.id, p.slug, p.title, p.difficulty::text AS difficulty,
             ts_rank(p."searchVector", plainto_tsquery('english', ${q}), 2) AS rank
      FROM "Problem" p
      WHERE p.status = 'PUBLISHED' AND p.visibility = 'PUBLIC'
        AND p."searchVector" @@ plainto_tsquery('english', ${q})
    ),
    trgm AS (
      -- Explicit threshold rather than the trigram "%" operator, which
      -- depends on the session's pg_trgm.similarity_threshold GUC (default
      -- 0.3) — keeping it explicit here makes the fallback's behavior
      -- independent of session/DB configuration.
      SELECT p.id, p.slug, p.title, p.difficulty::text AS difficulty,
             similarity(p.title, ${q}) AS rank
      FROM "Problem" p
      WHERE p.status = 'PUBLISHED' AND p.visibility = 'PUBLIC'
        AND similarity(p.title, ${q}) > 0.2
    ),
    combined AS (
      SELECT * FROM fts
      UNION ALL
      SELECT * FROM trgm
    )
    SELECT id, slug, title, difficulty, MAX(rank)::float AS rank
    FROM combined
    GROUP BY id, slug, title, difficulty
    ORDER BY rank DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    type: "problem" as const,
    id: r.id,
    slug: r.slug,
    title: r.title,
    difficulty: r.difficulty,
    rank: Number(r.rank),
  }));
}

/** Plain `ILIKE` + trigram similarity over `title` — no generated column yet. */
export async function searchContests(query: string, limit = 10): Promise<ContestSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const rows = await prisma.$queryRaw<Array<{ id: string; slug: string; title: string; rank: number }>>`
    SELECT id, slug, title,
           GREATEST(similarity(title, ${q}), CASE WHEN title ILIKE ${"%" + q + "%"} THEN 0.5 ELSE 0 END)::float AS rank
    FROM "Contest"
    WHERE visibility = 'PUBLIC'
      AND (title ILIKE ${"%" + q + "%"} OR similarity(title, ${q}) > 0.2)
    ORDER BY rank DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({ type: "contest" as const, id: r.id, slug: r.slug, title: r.title, rank: Number(r.rank) }));
}

/** Plain `ILIKE` + trigram similarity over `name`. Suspended/private profiles excluded. */
export async function searchUsers(query: string, limit = 10): Promise<UserSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; rank: number }>>`
    SELECT id, name,
           GREATEST(similarity(name, ${q}), CASE WHEN name ILIKE ${"%" + q + "%"} THEN 0.5 ELSE 0 END)::float AS rank
    FROM "User"
    WHERE status = 'ACTIVE' AND "profilePublic" = true
      AND (name ILIKE ${"%" + q + "%"} OR similarity(name, ${q}) > 0.2)
    ORDER BY rank DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({ type: "user" as const, id: r.id, name: r.name, rank: Number(r.rank) }));
}

export type SearchAllResult = {
  problems: ProblemSearchHit[];
  contests: ContestSearchHit[];
  users: UserSearchHit[];
};

/** Runs the three per-entity searches and returns a tagged, per-type-limited result. */
export async function searchAll(query: string, limitPerType = 5): Promise<SearchAllResult> {
  const [problems, contests, users] = await Promise.all([
    searchProblems(query, limitPerType),
    searchContests(query, limitPerType),
    searchUsers(query, limitPerType),
  ]);
  return { problems, contests, users };
}
