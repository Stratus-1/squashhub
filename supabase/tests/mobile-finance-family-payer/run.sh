#!/usr/bin/env bash
# Throwaway local PostgreSQL check for the Player finance family-payer correction.
set -euo pipefail
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE SUPABASE_DB_URL || true
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
D="$(mktemp -d)"; chmod 777 "$D"
if command -v setpriv >/dev/null 2>&1; then
  run_pg() { setpriv --reuid=1000 --regid=1000 --clear-groups -- "$@"; }
else
  # macOS developer machines have no setpriv; initdb can run as the current
  # non-root user while the database role remains the same test-only role.
  run_pg() { "$@"; }
fi
trap 'run_pg pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
run_pg initdb -D "$D/data" -U lovable >/dev/null
run_pg pg_ctl -D "$D/data" -o "-p 54431 -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P="psql -X -q -v ON_ERROR_STOP=1 -h $D -p 54431 -U lovable -d postgres"
$P -f "$HERE/schema.sql"
grep -v '^NOTIFY' "$ROOT/supabase/migrations/20261111200000_mobile_member_finance_family_payer_correction.sql" | $P
# 0397 replaces the function; set SKIP_0397=1 to prove the paid-history checks fail on 0396 alone.
if [ -z "${SKIP_0397:-}" ]; then
  grep -v '^NOTIFY' "$ROOT/supabase/migrations/20261111210000_mobile_member_finance_payer_fees_paid_history.sql" | $P
fi
# 0398 adds unposted own unpaid fees; set SKIP_0398=1 to prove the checks fail on 0397 alone.
if [ -z "${SKIP_0397:-}" ] && [ -z "${SKIP_0398:-}" ]; then
  grep -v '^NOTIFY' "$ROOT/supabase/migrations/20261111220000_mobile_member_finance_unposted_own_fees.sql" | $P
fi
$P -f "$HERE/test.sql"
echo 'MOBILE FINANCE FAMILY PAYER TESTS PASSED'
