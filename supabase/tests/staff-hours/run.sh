#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../.."
D="$(mktemp -d)"
chmod 777 "$D"
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$D/data" -U lovable >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -o "-p 54425 -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P=(psql -X -q -v ON_ERROR_STOP=1 -h "$D" -p 54425 -U lovable -d postgres)
"${P[@]}" -f "$HERE/stubs.sql"
"${P[@]}" -f "$HERE/base-payroll.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0251_bar_staff_pay_per_shift.sql"
"${P[@]}" -f "${STAFF_HOURS_SQL:-$ROOT/drizzle/migrations/0252_bar_staff_hours_and_shared_tips.sql}"
"${P[@]}" -f "$ROOT/drizzle/migrations/0253_bar_shift_review_and_management_status.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0254_payroll_review_overrides.sql"
"${P[@]}" -f "$HERE/test.sql"
echo 'STAFF HOURS TESTS PASSED'
