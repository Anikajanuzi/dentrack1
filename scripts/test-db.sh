#!/usr/bin/env bash
# Runs the database test suite against a throwaway local PostgreSQL database.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="dentrack_test_$$"
"$ROOT/scripts/db-local.sh" "$DB" >/dev/null 2>&1 || { echo "migration failed"; exit 1; }
trap 'psql -q -d postgres -c "drop database if exists \"$DB\" with (force)" >/dev/null 2>&1' EXIT
for f in "$ROOT"/tests/db/*.sql; do
  echo "▶ $(basename "$f")"
  out=$(psql -X -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" 2>&1); code=$?
  echo "$out" | grep -v '^$' | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
  if [ $code -ne 0 ]; then echo "✗ $(basename "$f") failed"; exit 1; fi
done
for f in "$ROOT"/tests/db/*.sh; do echo "▶ $(basename "$f")"; "$f" "$DB" || exit 1; done
echo "✓ database suite passed"
