#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../.."
D="$(mktemp -d)"
chmod 777 "$D"
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$D"' EXIT
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$D/data" -U lovable >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$D/data" -o "-p 54428 -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P=(psql -X -q -v ON_ERROR_STOP=1 -h "$D" -p 54428 -U lovable -d postgres)
"${P[@]}" -f "$HERE/stubs.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0074_apply_to_club_as_existing_person.sql"
"${P[@]}" -f "$ROOT/supabase/migrations/20260922064218_30d6db3f-4e7c-4357-bfeb-db265d894225.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0125_migration.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0258_unsigned_club_membership_applications.sql"
"${P[@]}" -f "$ROOT/drizzle/migrations/0259_membership_applications_active_trials.sql"
"${P[@]}" -f "$HERE/test.sql"
echo 'MEMBERSHIP AVAILABILITY TESTS PASSED'