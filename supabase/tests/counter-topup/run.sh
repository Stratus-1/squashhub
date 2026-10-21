#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../../.."
D="$(mktemp -d)"; PORT=${PORT:-54409}
trap 'pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
initdb -D "$D/data" -U lovable >/dev/null
pg_ctl -D "$D/data" -o "-p $PORT -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P="psql -X -q -v ON_ERROR_STOP=1 -h $D -p $PORT -U lovable -d postgres"
$P -f "$HERE/stubs.sql"
python3 - "$ROOT/supabase/migrations/20260903145945_71158d25-dfe8-44ad-87ac-8144b10387ca.sql" "$D/context.sql" <<'PY'
import sys
text=open(sys.argv[1]).read()
start=text.index('CREATE OR REPLACE FUNCTION public.bar_counter_context(')
end=text.index('END; $$;',start)+len('END; $$;')
open(sys.argv[2],'w').write(text[start:end])
PY
$P -f "$D/context.sql"
$P -f "$ROOT/drizzle/migrations/0212_bar_topup_card_only.sql"
$P -c "DO \$\$ BEGIN IF has_function_privilege('anon','bar_counter_topup_member(uuid,numeric,text,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Baseline must reproduce missing permission'; END IF; END \$\$;"
$P -f "$ROOT/drizzle/migrations/0224_bar_counter_topup_pin_access.sql"
$P -f "$HERE/test.sql"
echo "PIN-ONLY COUNTER TOP-UP TESTS PASSED"