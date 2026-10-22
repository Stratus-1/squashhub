#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../.."
D="$(mktemp -d)"
chmod 777 "$D"
trap 'runuser -u nobody -- pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
runuser -u nobody -- initdb -D "$D/data" -U lovable >/dev/null
runuser -u nobody -- pg_ctl -D "$D/data" -o "-p 54419 -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P=(psql -X -q -v ON_ERROR_STOP=1 -h "$D" -p 54419 -U lovable -d postgres)
"${P[@]}" -f "$HERE/stubs.sql"
python3 - "$ROOT/drizzle/migrations/0213_bar_cash_up_tips_and_writeoff.sql" "$D/function.sql" <<'PY'
import sys
s=open(sys.argv[1]).read()
s=s[s.index('CREATE OR REPLACE FUNCTION'):s.index('REVOKE ALL')]
open(sys.argv[2],'w').write(s)
PY
"${P[@]}" -f "$D/function.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0239_reject_negative_cash_up_tip_payouts.sql"
"${P[@]}" -f "$HERE/test.sql"
echo 'CASH-UP POSITIVE PAYOUT TESTS PASSED'