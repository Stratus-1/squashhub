#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../.."
D="$(mktemp -d)"
chmod 777 "$D"
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$D/data" -U lovable >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -o "-p 54450 -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P=(psql -X -q -v ON_ERROR_STOP=1 -h "$D" -p 54450 -U lovable -d postgres)
"${P[@]}" -f "$HERE/stubs.sql"
"${P[@]}" -f "$HERE/canonical.sql"
"${P[@]}" -f "${CHAIRMAN_ACTION_MIGRATION:-$ROOT/drizzle/migrations/0310_chairman_routine_actions.sql}"
"${P[@]}" -f "$HERE/test.sql"
echo 'CHAIRMAN ROUTINE ACTION TESTS PASSED'
