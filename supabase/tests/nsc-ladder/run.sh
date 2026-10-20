#!/usr/bin/env bash
set -euo pipefail
: "${NSC_LADDER_TEST_DATABASE_URL:?Use a disposable local PostgreSQL database only}"
psql "$NSC_LADDER_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/nsc-ladder/setup.sql \
  -f drizzle/migrations/0218_nsc_same_row_verified_ladder_results.sql \
  -f supabase/tests/nsc-ladder/test.sql
