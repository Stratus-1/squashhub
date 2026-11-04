#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../.."
D="$(mktemp -d)"
chmod 777 "$D"
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$D/data" -U lovable >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -o "-p 54465 -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P=(psql -X -q -v ON_ERROR_STOP=1 -h "$D" -p 54465 -U lovable -d postgres)
"${P[@]}" -f "$HERE/stubs.sql"
python3 - "$ROOT" "$D" <<'PYTHON'
from pathlib import Path
import sys
root, tmp = map(Path, sys.argv[1:])
s = (root / 'drizzle/migrations/0349_mobile_booking_policy_and_admin_inspection.sql').read_text()
a = s[s.index('CREATE FUNCTION public.mobile_booking_assert_ready('):s.index('REVOKE ALL ON FUNCTION public.mobile_booking_assert_ready')]
a = a.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION', 1)
b = s[s.index('CREATE OR REPLACE FUNCTION public.mobile_booking_availability('):s.index('REVOKE ALL ON FUNCTION public.mobile_booking_availability')]
(tmp / 'baseline.sql').write_text(a + b)
PYTHON
"${P[@]}" -f "$D/baseline.sql"
"${P[@]}" -f "${MIGRATION_SQL:-$ROOT/drizzle/migrations/0355_mobile_booking_permission_cap_parity.sql}"
"${P[@]}" -f "$HERE/test.sql"
echo 'PLAYER BOOKING PERMISSION TESTS PASSED'
