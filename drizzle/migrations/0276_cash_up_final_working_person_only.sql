CREATE OR REPLACE FUNCTION public._bar_cash_up_final_staff(_club uuid,_staff uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM bar_staff_attendance WHERE club_id=_club AND ended_at IS NULL AND (_staff IS NULL OR staff_id<>_staff))
$$;
REVOKE ALL ON FUNCTION public._bar_cash_up_final_staff(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._bar_cash_up_final_staff(uuid,uuid) TO service_role;
DO $ddl$
DECLARE def text; sig text;
BEGIN
 FOREACH sig IN ARRAY ARRAY['public.bar_cash_up_close(uuid,timestamptz,numeric,text,uuid,uuid)','public.bar_cash_up_close_v2(uuid,timestamptz,jsonb,numeric,numeric,boolean,text,uuid,uuid)'] LOOP
 SELECT pg_get_functiondef(sig::regprocedure) INTO def;
 IF position('_bar_cash_up_final_staff' IN def)=0 THEN
 IF position('s := _bar_cash_up_start(_club_id);' IN def)>0 THEN
 def:=replace(def,'s := _bar_cash_up_start(_club_id);','IF NOT public._bar_cash_up_final_staff(_club_id,d) THEN RAISE EXCEPTION ''Cash-up is for the last working barman; others must end their own shifts first''; END IF; s := _bar_cash_up_start(_club_id);');
 ELSE
 def:=replace(def,'s:=_bar_cash_up_start(_club_id);','IF NOT public._bar_cash_up_final_staff(_club_id,d) THEN RAISE EXCEPTION ''Cash-up is for the last working barman; others must end their own shifts first''; END IF; s:=_bar_cash_up_start(_club_id);');
 END IF;
 IF position('_bar_cash_up_final_staff' IN def)=0 THEN RAISE EXCEPTION 'Cash-up writer definition mismatch: %',sig; END IF;
 EXECUTE def;
 END IF;
 END LOOP;
 SELECT pg_get_functiondef('public.bar_close_work_shift(uuid,uuid)'::regprocedure) INTO def;
 IF position('_bar_cash_up_final_staff' IN def)=0 THEN
 def:=replace(def,'SELECT * INTO w FROM bar_work_shifts', 'IF NOT public._bar_cash_up_final_staff(_club_id,public._bar_tip_authorise(_club_id,_token)) THEN RAISE EXCEPTION ''Cash-up is for the last working barman; others must end their own shifts first''; END IF; SELECT * INTO w FROM bar_work_shifts');
 EXECUTE def;
 END IF;
END $ddl$;
CREATE OR REPLACE FUNCTION public.bar_work_shift_status(_club_id uuid,_token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid;
BEGIN
 d:=public._bar_tip_authorise(_club_id,_token);
 RETURN jsonb_build_object('shift',(SELECT to_jsonb(w) FROM bar_work_shifts w WHERE w.club_id=_club_id AND w.closed_at IS NULL),
 'can_cash_up',public._bar_cash_up_final_staff(_club_id,d),
 'unallocated_tips',coalesce((SELECT sum(t.amount) FROM bar_tips t JOIN bar_work_shifts w ON w.id=t.work_shift_id WHERE t.club_id=_club_id AND w.closed_at IS NOT NULL AND t.status='earned' AND NOT EXISTS(SELECT 1 FROM bar_shift_tip_allocations a WHERE a.tip_id=t.id)),0));
END $$;