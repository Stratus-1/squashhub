CREATE OR REPLACE FUNCTION public._bar_tab_sales(_tab uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT coalesce(
  nullif((SELECT sum(s.total) FROM bar_visitor_sales s WHERE s.guest_tab_id=_tab),0),
  nullif((SELECT sum(l.unit_price*l.quantity) FROM bar_order_lines l JOIN bar_orders o ON o.id=l.order_id WHERE o.guest_tab_id=_tab),0),
  nullif(greatest((SELECT coalesce(sum(p.amount),0) FROM bar_tab_payment_events p WHERE p.tab_id=_tab AND p.action='confirmed')
    -(SELECT coalesce(sum(t.amount),0) FROM bar_tips t WHERE t.tab_id=_tab AND t.status IN ('earned','account_due')),0),0),
  0)
$$;
REVOKE ALL ON FUNCTION public._bar_tab_sales(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._bar_cash_up_summary(_club uuid, _start timestamp with time zone, _end timestamp with time zone)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH tx AS (
  SELECT CASE g.settled_method WHEN 'terminal' THEN 'card_bar' WHEN 'cash' THEN 'cash' WHEN 'member_account' THEN 'member_account' ELSE 'online' END m,
    _bar_tab_sales(g.id) sales,
    coalesce((SELECT sum(t.amount) FROM bar_tips t WHERE t.tab_id=g.id AND t.status IN ('earned','account_due')),0) tips
  FROM bar_guest_tabs g WHERE g.club_id=_club AND g.status='settled' AND g.settled_method IS NOT NULL
    AND coalesce(g.payment_confirmed_at,g.closed_at,g.opened_at)>_start AND coalesce(g.payment_confirmed_at,g.closed_at,g.opened_at)<=_end
  UNION ALL
  SELECT CASE s.payment_method WHEN 'cash' THEN 'cash' WHEN 'terminal' THEN 'card_bar' ELSE 'online' END,s.total,
    coalesce((SELECT sum(t.amount) FROM bar_tips t WHERE t.sale_id=s.id AND t.status='earned'),0)
  FROM bar_visitor_sales s WHERE s.club_id=_club AND s.guest_tab_id IS NULL AND s.payment_status='paid' AND s.created_at>_start AND s.created_at<=_end
), b AS (SELECT m,sum(sales) sales,sum(tips) tips,count(*) n FROM tx GROUP BY m),
p AS (SELECT coalesce(sum(amount),0) a FROM bar_tip_payouts WHERE club_id=_club AND created_at>_start AND created_at<=_end),
o AS (SELECT coalesce(sum(debit-credit),0) a FROM club_journal_entries WHERE club_id=_club AND account='cash' AND created_at<=_start)
SELECT jsonb_build_object('period_start',_start,'period_end',_end,
 'methods',(SELECT jsonb_object_agg(k,jsonb_build_object('sales',round(coalesce(b.sales,0),2),'tips',round(coalesce(b.tips,0),2),'count',coalesce(b.n,0))) FROM unnest(ARRAY['online','card_bar','cash','member_account']) k LEFT JOIN b ON b.m=k),
 'total_sales',round(coalesce((SELECT sum(sales) FROM b),0),2),'total_tips',round(coalesce((SELECT sum(tips) FROM b),0),2),
 'tip_payouts',round((SELECT a FROM p),2),
 'cash_opening',round((SELECT a FROM o),2),
 'expected_cash',round((SELECT a FROM o)+coalesce((SELECT sales+tips FROM b WHERE m='cash'),0)-(SELECT a FROM p),2))
$function$;

CREATE OR REPLACE FUNCTION public.bar_shift_overview(_club_id uuid, _token uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s timestamptz; BEGIN PERFORM _bar_tip_authorise(_club_id,_token);
s:=_bar_cash_up_start(_club_id);
RETURN _bar_cash_up_summary(_club_id,s,now()) || jsonb_build_object(
 'tabs',coalesce((SELECT jsonb_agg(x ORDER BY x->>'at' DESC) FROM (
   SELECT jsonb_build_object('id',g.id,'name',coalesce(g.guest_name,'Tab'),'method',g.settled_method,'operator',g.operator_name,
     'at',coalesce(g.payment_confirmed_at,g.closed_at,g.opened_at),
     'sales',_bar_tab_sales(g.id),
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
END $function$;