DO $verification$
DECLARE
  insert_sql text;
  update_sql text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_champs' AND column_name = 'champion_scope'
  ) THEN
    RAISE EXCEPTION 'club_champs.champion_scope is missing';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO insert_sql
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'club_champs_compat_insert' AND p.pronargs = 0;

  SELECT pg_get_functiondef(p.oid) INTO update_sql
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'club_champs_compat_update' AND p.pronargs = 0;

  IF insert_sql NOT LIKE '%NEW.champion_scope%' OR update_sql NOT LIKE '%champion_scope =%' THEN
    RAISE EXCEPTION 'champion_scope compatibility persistence is incomplete';
  END IF;
END;
$verification$;