#!/usr/bin/env bash
# Rebuild a local PostgreSQL database with the Supabase auth shim + all migrations.
# Usage: scripts/db-local.sh [database_name]
# Connection comes from standard PG* env vars (PGHOST, PGPORT, PGUSER).
set -euo pipefail
DB="${1:-dentrack}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists \"$DB\" with (force)" -c "create database \"$DB\""
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/local/auth_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
echo "✓ $DB ready ($(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations)"
