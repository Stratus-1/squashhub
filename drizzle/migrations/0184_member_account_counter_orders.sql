ALTER TABLE public.bar_orders ADD COLUMN IF NOT EXISTS club_member_id uuid;
ALTER TABLE public.bar_orders ADD COLUMN IF NOT EXISTS account_charged boolean NOT NULL DEFAULT false;
ALTER TABLE public.bar_order_lines ADD COLUMN IF NOT EXISTS member_tab_entry_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS bar_order_member_entry_once ON public.bar_order_lines(member_tab_entry_id) WHERE member_tab_entry_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.submit_my_bar_account_order(_club_id uuid, _club_member_id uuid, _lines jsonb, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE m public.club_members%ROWTYPE; v_order uuid; v_num int; v_key text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to place your order' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.club_members WHERE id=_club_member_id AND club_id=_club_id AND user_id=auth.uid() AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This membership is not yours or is not active' USING ERRCODE='42501'; END IF;
 IF _request_id IS NULL THEN RAISE EXCEPTION 'Missing order request'; END IF;
 v_key:='member_account:'||m.id::text||':'||_request_id::text;
 SELECT id INTO v_order FROM public.bar_orders WHERE club_id=_club_id AND idempotency_key=v_key;
 IF FOUND THEN RETURN public._bar_order_json(v_order); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.clubs WHERE id=_club_id AND honesty_bar_enabled AND COALESCE(bar_account_tab_enabled,true)) THEN RAISE EXCEPTION 'Member account ordering is not available'; END IF;
 IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Choose your items'; END IF;
 IF jsonb_array_length(_lines) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Choose between 1 and 30 items'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_lines) l LEFT JOIN public.bar_items i ON i.id=(l->>'bar_item_id')::uuid AND i.club_id=_club_id WHERE i.id IS NULL OR NOT public.bar_item_on_menu(i) OR COALESCE((l->>'quantity')::int,0) NOT BETWEEN 1 AND 50) THEN RAISE EXCEPTION 'An item or quantity is not available'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_lines) l GROUP BY l->>'bar_item_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Combine duplicate items first'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('bar_orders:'||_club_id::text));
 SELECT COALESCE(max(order_number),0)+1 INTO v_num FROM public.bar_orders WHERE club_id=_club_id;
 INSERT INTO public.bar_orders(club_id,club_member_id,account_charged,order_number,customer_name,fulfilment,idempotency_key)
 VALUES(_club_id,m.id,true,v_num,COALESCE(NULLIF(btrim(m.name),''),'Member'),'collect',v_key) RETURNING id INTO v_order;
 WITH charged AS (
  INSERT INTO public.bar_tab_entries(club_id,club_member_id,bar_item_id,quantity,unit_price,total)
  SELECT _club_id,m.id,i.id,(l->>'quantity')::int,i.price,round(i.price*(l->>'quantity')::int,2)
  FROM jsonb_array_elements(_lines) l JOIN public.bar_items i ON i.id=(l->>'bar_item_id')::uuid AND i.club_id=_club_id
  RETURNING id,bar_item_id,quantity,unit_price
 ) INSERT INTO public.bar_order_lines(order_id,club_id,bar_item_id,member_tab_entry_id,item_name,unit_price,quantity)
 SELECT v_order,_club_id,c.bar_item_id,c.id,i.name,c.unit_price,c.quantity FROM charged c JOIN public.bar_items i ON i.id=c.bar_item_id AND i.club_id=_club_id;
 INSERT INTO public.bar_order_events(club_id,order_id,action,actor_user_id) VALUES(_club_id,v_order,'member_account_submitted',auth.uid());
 RETURN public._bar_order_json(v_order);
END $fn$;
REVOKE ALL ON FUNCTION public.submit_my_bar_account_order(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_my_bar_account_order(uuid,uuid,jsonb,uuid) TO authenticated,service_role;
DO $patch$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public._bar_order_json(uuid)'::regprocedure);
 IF position('''account_charged'', o.account_charged' IN d)=0 THEN
  IF position('''tab_id'', t.id' IN d)=0 THEN RAISE EXCEPTION 'Unexpected order JSON'; END IF;
  d:=replace(d,'''tab_id'', t.id', '''account_charged'', o.account_charged, ''club_member_id'', o.club_member_id, ''tab_id'', t.id');
  d:=replace(d,'t.club_member_id IS NOT NULL AND EXISTS', 'COALESCE(o.club_member_id,t.club_member_id) IS NOT NULL AND EXISTS');
  d:=replace(d,'m.id = t.club_member_id','m.id = COALESCE(o.club_member_id,t.club_member_id)');
  EXECUTE d;
 END IF;
 d:=pg_get_functiondef('public.bar_counter_notify_ready(uuid[],boolean,uuid,uuid)'::regprocedure);
 IF position('COALESCE(v_order.club_member_id,v_tab.club_member_id)' IN d)=0 THEN
  IF position('IF v_tab.club_member_id IS NOT NULL THEN' IN d)=0 THEN RAISE EXCEPTION 'Unexpected ready notification'; END IF;
  d:=replace(d,'IF v_tab.club_member_id IS NOT NULL THEN','IF COALESCE(v_order.club_member_id,v_tab.club_member_id) IS NOT NULL THEN');
  d:=replace(d,'WHERE id = v_tab.club_member_id;','WHERE id = COALESCE(v_order.club_member_id,v_tab.club_member_id) AND club_id = v_club;');
  EXECUTE d;
 END IF;
END $patch$;
COMMENT ON COLUMN public.bar_orders.account_charged IS 'Already posted to the member account; fulfilment must not create another sale or payment.';
COMMENT ON COLUMN public.bar_order_lines.member_tab_entry_id IS 'Existing member sale entry, created atomically by submit_my_bar_account_order.';