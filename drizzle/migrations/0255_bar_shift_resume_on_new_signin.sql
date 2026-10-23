DO $ddl$ DECLARE def text; BEGIN
  SELECT pg_get_functiondef('public.bar_counter_start_shift(uuid,text,timestamptz,boolean)'::regprocedure) INTO def;
  IF position('This person already has an open shift; end or correct it first' IN def)=0 THEN RAISE EXCEPTION 'start_shift body changed; review manually'; END IF;
  def:=replace(def,
    'IF a.session_id<>s.id THEN RAISE EXCEPTION ''This person already has an open shift; end or correct it first''; END IF; RETURN to_jsonb(a);',
    'IF a.session_id<>s.id THEN UPDATE bar_staff_attendance SET session_id=s.id WHERE id=a.id RETURNING * INTO a; END IF; RETURN to_jsonb(a);');
  IF position('already has an open shift' IN def)>0 THEN RAISE EXCEPTION 'replace did not apply'; END IF;
  EXECUTE def;
END $ddl$;