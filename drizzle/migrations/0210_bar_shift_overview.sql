CREATE FUNCTION public.bar_shift_overview(_club_id uuid,_token uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s timestamptz; BEGIN PERFORM _bar_tip_authorise(_club_id,_token);
s:=_bar_cash_up_start(_club_id);
RETURN _bar_cash_up_summary(_club_id,s,now()) || jsonb_build_object(
 'tabs',coalesce((SELECT jsonb_agg(x ORDER BY x->>'at' DESC) FROM (
   SELECT jsonb_build_object('id',g.id,'name',coalesce(g.guest_name,'Tab'),'method',g.settled_method,'operator',g.operator_name,
     'at',coalesce(g.payment_confirmed_at,g.closed_at,g.opened_at),
     'sales',coalesce((SELECT sum(v.total) FROM bar_visitor_sales v WHERE v.guest_tab_id=g.id),0),
     'tip',coalesce((SELECT sum(t.amount) FROM bar_tips t WHERE t.tab_id=g.id AND t.status IN ('earned','account_due')),0)) x
   FROM bar_guest_tabs g WHERE g.club_id=_club_id AND g.status='settled' AND g.settled_method IS NOT NULL
     AND coalesce(g.payment_confirmed_at,g.closed_at,g.opened_at)>s
   UNION ALL
   SELECT jsonb_build_object('id',v.id,'name',coalesce(v.visitor_name,'Sale'),'method',v.payment_method,'operator',v.counter_operator_name,'at',v.created_at,'sales',v.total,
     'tip',coalesce((SELECT sum(t.amount) FROM bar_tips t WHERE t.sale_id=v.id AND t.status='earned'),0))
   FROM bar_visitor_sales v WHERE v.club_id=_club_id AND v.guest_tab_id IS NULL AND v.payment_status='paid' AND v.created_at>s
 ) q),'[]'::jsonb),
 'staff_tips',coalesce((SELECT jsonb_agg(jsonb_build_object('name',staff_name,'amount',a) ORDER BY staff_name) FROM (
   SELECT t.staff_name,sum(t.amount) a FROM bar_tips t WHERE t.club_id=_club_id AND t.status IN ('earned','account_due')
     AND coalesce(t.earned_at,t.created_at)>s GROUP BY t.staff_name) z),'[]'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION public.bar_shift_overview(uuid,uuid) TO anon,authenticated;