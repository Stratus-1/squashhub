CREATE TABLE public.bar_cash_ups(id uuid PRIMARY KEY,club_id uuid NOT NULL REFERENCES public.clubs(id),period_start timestamptz NOT NULL,period_end timestamptz NOT NULL CHECK(period_end>period_start),totals jsonb NOT NULL,expected_cash numeric(12,2) NOT NULL,counted_cash numeric(12,2) NOT NULL CHECK(counted_cash>=0),variance numeric(12,2) NOT NULL,note text,closed_by_device uuid REFERENCES public.bar_counter_devices(id),closed_by_name text,actor_user_id uuid,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(club_id,period_start),UNIQUE(club_id,period_end));
GRANT SELECT ON public.bar_cash_ups TO authenticated;
GRANT ALL ON public.bar_cash_ups TO service_role;
ALTER TABLE public.bar_cash_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY bar_cash_up_read ON public.bar_cash_ups FOR SELECT TO authenticated USING(public.is_club_admin_or_permitted(auth.uid(),club_id,'bar') OR public.has_club_permission(auth.uid(),club_id,'finance'));

CREATE FUNCTION public._bar_cash_up_summary(_club uuid,_start timestamptz,_end timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH tx AS (
  SELECT CASE g.settled_method WHEN 'terminal' THEN 'card_bar' WHEN 'cash' THEN 'cash' WHEN 'member_account' THEN 'member_account' ELSE 'online' END m,
    coalesce((SELECT sum(s.total) FROM bar_visitor_sales s WHERE s.guest_tab_id=g.id),0) sales,
    coalesce((SELECT sum(t.amount) FROM bar_tips t WHERE t.tab_id=g.id AND t.status IN ('earned','account_due')),0) tips
  FROM bar_guest_tabs g WHERE g.club_id=_club AND g.status='settled' AND g.settled_method IS NOT NULL
    AND coalesce(g.payment_confirmed_at,g.closed_at,g.opened_at)>_start AND coalesce(g.payment_confirmed_at,g.closed_at,g.opened_at)<=_end
  UNION ALL
  SELECT CASE s.payment_method WHEN 'cash' THEN 'cash' WHEN 'terminal' THEN 'card_bar' ELSE 'online' END,s.total,
    coalesce((SELECT sum(t.amount) FROM bar_tips t WHERE t.sale_id=s.id AND t.status='earned'),0)
  FROM bar_visitor_sales s WHERE s.club_id=_club AND s.guest_tab_id IS NULL AND s.payment_status='paid' AND s.created_at>_start AND s.created_at<=_end
), b AS (SELECT m,sum(sales) sales,sum(tips) tips,count(*) n FROM tx GROUP BY m),
p AS (SELECT coalesce(sum(amount),0) a FROM bar_tip_payouts WHERE club_id=_club AND created_at>_start AND created_at<=_end)
SELECT jsonb_build_object('period_start',_start,'period_end',_end,
 'methods',(SELECT jsonb_object_agg(k,jsonb_build_object('sales',round(coalesce(b.sales,0),2),'tips',round(coalesce(b.tips,0),2),'count',coalesce(b.n,0))) FROM unnest(ARRAY['online','card_bar','cash','member_account']) k LEFT JOIN b ON b.m=k),
 'total_sales',round(coalesce((SELECT sum(sales) FROM b),0),2),'total_tips',round(coalesce((SELECT sum(tips) FROM b),0),2),
 'tip_payouts',round((SELECT a FROM p),2),
 'expected_cash',round(coalesce((SELECT sales+tips FROM b WHERE m='cash'),0)-(SELECT a FROM p),2))
$$;
REVOKE ALL ON FUNCTION public._bar_cash_up_summary(uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._bar_cash_up_start(_club uuid) RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT coalesce((SELECT max(period_end) FROM bar_cash_ups WHERE club_id=_club),
 (SELECT least(coalesce((SELECT min(coalesce(payment_confirmed_at,closed_at,opened_at)) FROM bar_guest_tabs WHERE club_id=_club),now()),coalesce((SELECT min(created_at) FROM bar_visitor_sales WHERE club_id=_club),now()))-interval '1 second'))
$$;
REVOKE ALL ON FUNCTION public._bar_cash_up_start(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.bar_cash_up_preview(_club_id uuid,_token uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM _bar_tip_authorise(_club_id,_token);
IF NOT EXISTS(SELECT 1 FROM club_bar_settings WHERE club_id=_club_id AND cash_up_enabled) THEN RAISE EXCEPTION 'Cash-up is not enabled'; END IF;
RETURN _bar_cash_up_summary(_club_id,_bar_cash_up_start(_club_id),now()); END $$;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_preview(uuid,uuid) TO anon,authenticated;

CREATE FUNCTION public.bar_cash_up_close(_club_id uuid,_period_start timestamptz,_counted_cash numeric,_note text,_request_id uuid,_token uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid;s timestamptz;e timestamptz:=now();sm jsonb;prior bar_cash_ups;n text;
BEGIN d:=_bar_tip_authorise(_club_id,_token);
IF NOT EXISTS(SELECT 1 FROM club_bar_settings WHERE club_id=_club_id AND cash_up_enabled) THEN RAISE EXCEPTION 'Cash-up is not enabled'; END IF;
IF _request_id IS NULL OR _counted_cash IS NULL OR _counted_cash<0 OR _counted_cash::text IN ('NaN','Infinity') OR _counted_cash<>round(_counted_cash,2) THEN RAISE EXCEPTION 'Invalid counted cash'; END IF;
PERFORM pg_advisory_xact_lock(hashtext('bar_cash_up:'||_club_id));
SELECT * INTO prior FROM bar_cash_ups WHERE id=_request_id; IF FOUND THEN IF prior.club_id<>_club_id THEN RAISE EXCEPTION 'Cash-up retry does not match'; END IF; RETURN to_jsonb(prior); END IF;
s:=_bar_cash_up_start(_club_id);
IF _period_start IS DISTINCT FROM s THEN RAISE EXCEPTION 'Another cash-up was completed; refresh and try again'; END IF;
sm:=_bar_cash_up_summary(_club_id,s,e);
IF d IS NOT NULL THEN SELECT label INTO n FROM bar_counter_devices WHERE id=d; END IF;
INSERT INTO bar_cash_ups(id,club_id,period_start,period_end,totals,expected_cash,counted_cash,variance,note,closed_by_device,closed_by_name,actor_user_id)
VALUES(_request_id,_club_id,s,e,sm,(sm->>'expected_cash')::numeric,_counted_cash,_counted_cash-(sm->>'expected_cash')::numeric,nullif(btrim(left(_note,500)),''),d,n,auth.uid()) RETURNING * INTO prior;
RETURN to_jsonb(prior); END $$;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_close(uuid,timestamptz,numeric,text,uuid,uuid) TO anon,authenticated;

CREATE FUNCTION public.bar_cash_up_history(_club_id uuid,_token uuid DEFAULT NULL) RETURNS SETOF public.bar_cash_ups LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM _bar_tip_authorise(_club_id,_token); RETURN QUERY SELECT * FROM bar_cash_ups WHERE club_id=_club_id ORDER BY period_end DESC LIMIT 20; END $$;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_history(uuid,uuid) TO anon,authenticated;