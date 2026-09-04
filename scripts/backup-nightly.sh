#!/usr/bin/env bash
#
# Phase 13 Part 6 — nightly Postgres backup to R2.
#
# `pg_dump "$DIRECT_URL" | gzip` piped straight into an `aws s3 cp` upload
# against R2's S3-compatible endpoint (same credentials `src/lib/blob.ts`'s
# S3BlobStore driver already reads: R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /
# R2_SECRET_ACCESS_KEY / R2_BUCKET). No `aws` CLI usage exists anywhere else
# in this repo, so this keeps the approach as simple as possible: install the
# AWS CLI and configure it (or export the env vars below inline, which the
# CLI also honors) rather than reimplementing multipart S3 upload signing by
# hand for a script that runs once a day.
#
# This is meant to run nightly via cron or a CI scheduled job (e.g. a GitHub
# Actions workflow on a `schedule:` trigger). IT IS NOT SCHEDULED ANYWHERE IN
# THIS REPO YET — no cron entry and no GitHub Actions workflow invoke it
# automatically. Wiring that up is a follow-up once an R2 bucket actually
# exists to back up into.
#
# Usage:
#   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
#     R2_BUCKET=... DIRECT_URL=... ./scripts/backup-nightly.sh
#
# Retention: this script uploads one object per run
# (backups/postgres/<UTC timestamp>.sql.gz); pruning objects older than 30
# days (per docs/DR.md's RPO/RTO table) is left to an R2 lifecycle rule on the
# `backups/postgres/` prefix, configured once the bucket exists — not
# reimplemented here.

set -euo pipefail

if [[ -z "${R2_ACCOUNT_ID:-}" || -z "${R2_ACCESS_KEY_ID:-}" || -z "${R2_SECRET_ACCESS_KEY:-}" || -z "${R2_BUCKET:-}" ]]; then
  echo "backup-nightly: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET must all be set." >&2
  echo "  This environment has none of them configured — nothing to back up into yet." >&2
  echo "  See .env.example for the expected format; see src/lib/blob.ts for how the app reads the same vars." >&2
  exit 0
fi

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "backup-nightly: DIRECT_URL (unpooled Neon connection string) is required for pg_dump." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "backup-nightly: pg_dump not found on PATH. Install the Postgres client tools." >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "backup-nightly: aws CLI not found on PATH. Install it (https://aws.amazon.com/cli/) —" >&2
  echo "  no credential profile setup is required beyond the R2_* env vars above; this script" >&2
  echo "  passes them via --endpoint-url and AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY below." >&2
  exit 1
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="s3://${R2_BUCKET}/backups/postgres/${TIMESTAMP}.sql.gz"
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "backup-nightly: dumping database and streaming to ${DEST}"

pg_dump "$DIRECT_URL" | gzip \
  | AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    aws s3 cp - "$DEST" \
      --endpoint-url "$ENDPOINT" \
      --region auto \
      --content-type "application/gzip"

echo "backup-nightly: done — ${DEST}"
