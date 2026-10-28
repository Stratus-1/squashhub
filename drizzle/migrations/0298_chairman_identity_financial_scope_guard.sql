DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='guard_chairman_financial_write';
 d:=replace(d,'IF TG_TABLE_NAME=''club_members'' THEN','IF TG_TABLE_NAME=''club_members'' THEN IF (TG_OP=''DELETE'' AND oldj->>''user_id''=auth.uid()::text) OR (TG_OP=''UPDATE'' AND oldj->>''user_id''=auth.uid()::text AND (j->''user_id'' IS DISTINCT FROM oldj->''user_id'' OR j->''club_id'' IS DISTINCT FROM oldj->''club_id'')) THEN RAISE EXCEPTION ''Chairman cannot remove their own permission identity'' USING ERRCODE=''42501''; END IF;');
 EXECUTE d;
END $$;