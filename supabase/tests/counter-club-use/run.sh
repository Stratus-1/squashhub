#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../.."
D="$(mktemp -d)"; chmod 777 "$D"
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$D/data" -U lovable >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -o "-p 54421 -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P=(psql -X -q -v ON_ERROR_STOP=1 -h "$D" -p 54421 -U lovable -d postgres)
"${P[@]}" -f "$HERE/stubs.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0241_pin_counter_club_sponsored_stock.sql"
"${P[@]}" -f "${SPONSORED_SPECIALS_MIGRATION:-$ROOT/drizzle/migrations/0312_club_sponsored_specials.sql}"
"${P[@]}" -f "$HERE/test.sql"
echo 'PIN CLUB-SPONSORED STOCK TESTS PASSED'