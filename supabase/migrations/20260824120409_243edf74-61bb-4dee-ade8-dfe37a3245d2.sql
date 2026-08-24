DO $migration$
DECLARE
  function_sql text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO function_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'club_champs_compat_insert'
    AND p.pronargs = 0;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'public.club_champs_compat_insert() does not exist';
  END IF;

  IF function_sql NOT LIKE '%NEW.champion_scope%' THEN
    function_sql := replace(
      function_sql,
      E'invite_audience_include_individuals, scheduling_mode, round_play_by\n  ) VALUES',
      E'invite_audience_include_individuals, scheduling_mode, round_play_by, champion_scope\n  ) VALUES'
    );
    function_sql := replace(
      function_sql,
      E'COALESCE(NEW.round_play_by,''{}''::jsonb)\n  ) RETURNING',
      E'COALESCE(NEW.round_play_by,''{}''::jsonb),\n    COALESCE(NULLIF(btrim(NEW.champion_scope),''''),''division'')\n  ) RETURNING'
    );

    IF function_sql NOT LIKE '%NEW.champion_scope%' THEN
      RAISE EXCEPTION 'Could not safely patch public.club_champs_compat_insert()';
    END IF;

    EXECUTE function_sql;
  END IF;

  SELECT pg_get_functiondef(p.oid)
  INTO function_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'club_champs_compat_update'
    AND p.pronargs = 0;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'public.club_champs_compat_update() does not exist';
  END IF;

  IF function_sql NOT LIKE '%champion_scope =%' THEN
    function_sql := replace(
      function_sql,
      'round_play_by = COALESCE(NEW.round_play_by, round_play_by)',
      E'round_play_by = COALESCE(NEW.round_play_by, round_play_by),\n    champion_scope = COALESCE(NULLIF(btrim(NEW.champion_scope),''''), champion_scope)'
    );

    IF function_sql NOT LIKE '%champion_scope =%' THEN
      RAISE EXCEPTION 'Could not safely patch public.club_champs_compat_update()';
    END IF;

    EXECUTE function_sql;
  END IF;
END;
$migration$;