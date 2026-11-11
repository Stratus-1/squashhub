#!/usr/bin/env bash
# Throwaway local PostgreSQL check for the Player finance family-payer correction.
set -euo pipefail
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE SUPABASE_DB_URL || true
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
D="$(mktemp -d)"; chmod 777 "$D"
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$D/data" -U lovable >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -o "-p 54431 -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P="psql -X -q -v ON_ERROR_STOP=1 -h $D -p 54431 -U lovable -d postgres"
$P -f "$HERE/schema.sql"
grep -v '^NOTIFY' "$ROOT/supabase/migrations/20261111200000_mobile_member_finance_family_payer_correction.sql" | $P
$P -f "$HERE/test.sql"
echo 'MOBILE FINANCE FAMILY PAYER TESTS PASSED'
