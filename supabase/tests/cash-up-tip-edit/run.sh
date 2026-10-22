#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../.."
D="$(mktemp -d)"
chmod 777 "$D"
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$D/data" -U lovable >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -o "-p 54420 -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P=(psql -X -q -v ON_ERROR_STOP=1 -h "$D" -p 54420 -U lovable -d postgres)
"${P[@]}" -f "$HERE/stubs.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0230_bar_cash_up_first_opening.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0234_bar_cash_up_undo.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0240_cash_up_paid_tip_corrections.sql"
"${P[@]}" -f "$HERE/test.sql"
echo 'CASH-UP PAID-TIP EDIT TESTS PASSED'