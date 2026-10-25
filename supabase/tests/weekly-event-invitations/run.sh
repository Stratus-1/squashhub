#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
D="$(mktemp -d)"; chmod 777 "$D"
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$D/data" -U lovable >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -o "-p 54439 -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -h "$D" -p 54439 -U lovable -d postgres -f "$HERE/test.sql"
echo 'WEEKLY EVENT CHANNEL TESTS PASSED'
