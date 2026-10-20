#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../../.."
D="$(mktemp -d)"; PORT=${PORT:-54407}
trap 'pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
initdb -D "$D/data" -U lovable >/dev/null
pg_ctl -D "$D/data" -o "-p $PORT -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P="psql -X -q -v ON_ERROR_STOP=1 -h $D -p $PORT -U lovable -d postgres"
$P -f "$HERE/stubs.sql"
python3 - "$ROOT/drizzle/migrations/0208_bar_tips_and_cash_payouts.sql" "$D/tip-engine.sql" <<'PY'
import sys
lines=open(sys.argv[1]).readlines()
names=['_bar_prepare_tip','_bar_recognise_account_tips','_bar_earn_tip','_bar_tip_tab_state','_bar_tip_account_payment']
chosen=[line for line in lines if any(line.startswith('CREATE FUNCTION public.'+name+'(') for name in names)]
chosen += [line for line in lines if line.startswith('CREATE TRIGGER bar_tip_tab_state ') or line.startswith('CREATE TRIGGER bar_tip_account_payment ')]
open(sys.argv[2],'w').writelines(chosen)
PY
$P -f "$D/tip-engine.sql"
$P -f "$ROOT/drizzle/migrations/0221_bar_session_charge.sql"
$P -f "$ROOT/drizzle/migrations/0222_bar_member_session_tips.sql"
$P -f "$ROOT/drizzle/migrations/0223_bar_member_tip_ownership_guard.sql"
$P -f "$HERE/test.sql"
echo "MEMBER SESSION TIP AUTHORITY TESTS PASSED"