#!/usr/bin/env bash
# Disposable local Postgres test for the Help Center pilot gate. Synthetic data only.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../../.."
D="$(mktemp -d)"; PORT=${PORT:-54399}
trap 'pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
initdb -D "$D/data" -U postgres >/dev/null
pg_ctl -D "$D/data" -o "-p $PORT -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P="psql -X -q -t -v ON_ERROR_STOP=1 -h $D -p $PORT -U postgres -d postgres"
$P -f "$HERE/stubs.sql"
for m in 20260930105238 20260930112318 20260930115650; do $P -f "$ROOT"/supabase/migrations/${m}_*.sql; done
$P -f "$HERE/seed_pre_gate.sql"
$P -f "$ROOT/supabase/pending-migrations/20260930150800_help_center_pilot_gate.sql"
$P -f "$HERE/test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
echo "ALL PILOT-GATE TESTS PASSED"
