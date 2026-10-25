CREATE OR REPLACE FUNCTION public.bar_admin_remove_zero_tab(_club_id uuid, _tab_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.bar_guest_tabs%ROWTYPE; outstanding numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') OR public.is_club_admin_or_permitted(auth.uid(), _club_id, 'finance')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT * INTO t FROM public.bar_guest_tabs WHERE id=_tab_id AND club_id=_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF t.status='closed' AND EXISTS (SELECT 1 FROM public.bar_tab_payment_events WHERE tab_id=t.id AND action='removed_zero') THEN RETURN; END IF;
  IF t.status <> 'open' THEN RAISE EXCEPTION 'Only open tabs can be removed'; END IF;
  SELECT COALESCE(sum(total),0) INTO outstanding FROM public.bar_visitor_sales WHERE guest_tab_id=t.id;
  outstanding := outstanding + COALESCE((SELECT sum(amount) FROM public.bar_tips WHERE tab_id=t.id AND status <> 'cancelled'),0);
  IF outstanding <> 0 THEN RAISE EXCEPTION 'Only tabs with zero outstanding can be removed'; END IF;
  UPDATE public.bar_guest_tabs SET status='closed', closed_at=now() WHERE id=t.id;
  INSERT INTO public.bar_tab_payment_events(club_id,tab_id,action,amount,reason,actor_user_id)
    VALUES(_club_id,t.id,'removed_zero',0,'Zero-outstanding open tab removed by authorised management',auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.bar_admin_remove_zero_tab(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_admin_remove_zero_tab(uuid,uuid) TO authenticated;
DO $$ DECLARE d text; BEGIN
  SELECT pg_get_functiondef('public.add_to_bar_guest_tab(uuid,uuid,jsonb)'::regprocedure) INTO d;
  IF position('WHERE id = _tab_id AND token = _token;' IN d)>0 THEN
    d := replace(d,'WHERE id = _tab_id AND token = _token;','WHERE id = _tab_id AND token = _token FOR UPDATE;');
    EXECUTE d;
  ELSIF position('WHERE id = _tab_id AND token = _token FOR UPDATE;' IN d)=0 THEN
    RAISE EXCEPTION 'Tab add lock marker not found';
  END IF;
  SELECT pg_get_functiondef('public.bar_open_tabs(uuid)'::regprocedure) INTO d;
  d := replace(d, 'IF NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, ''bar'') THEN', 'IF auth.uid() IS NULL OR NOT (public.is_club_admin_or_permitted(auth.uid(), _club_id, ''bar'') OR public.is_club_admin_or_permitted(auth.uid(), _club_id, ''finance'')) THEN');
  d := replace(d, '''total'', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = g.id), 0),', '''total'', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = g.id), 0) + COALESCE((SELECT sum(amount) FROM public.bar_tips WHERE tab_id = g.id AND status <> ''cancelled''), 0),');
  IF position('''finance''' IN d)=0 OR position('FROM public.bar_tips' IN d)=0 THEN RAISE EXCEPTION 'Open tab management markers not found'; END IF;
  EXECUTE d;
END; $$;