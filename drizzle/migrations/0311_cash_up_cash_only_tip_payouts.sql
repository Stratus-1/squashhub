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
p AS (SELECT coalesce(sum(amount),0) a FROM bar_tip_payouts WHERE club_id=_club AND method='cash' AND created_at>_start AND created_at<=_end),
o AS (SELECT coalesce(sum(debit-credit),0) a FROM club_journal_entries WHERE club_id=_club AND account='cash' AND created_at<=_start),
j AS (SELECT coalesce(sum(j.debit-j.credit),0) a FROM club_journal_entries j WHERE j.club_id=_club AND j.account='cash' AND j.created_at>_start AND j.created_at<=_end AND NOT EXISTS(SELECT 1 FROM bar_cash_ups c WHERE c.club_id=_club AND c.id=j.journal_ref)),
movement AS (SELECT round((SELECT a FROM j)-coalesce((SELECT sales+tips FROM b WHERE m='cash'),0)+(SELECT a FROM p),2) a)
SELECT jsonb_build_object('period_start',_start,'period_end',_end,
 'methods',(SELECT jsonb_object_agg(k,jsonb_build_object('sales',round(coalesce(b.sales,0),2),'tips',round(coalesce(b.tips,0),2),'count',coalesce(b.n,0))) FROM unnest(ARRAY['online','card_bar','cash','member_account']) k LEFT JOIN b ON b.m=k),
 'total_sales',round(coalesce((SELECT sum(sales) FROM b),0),2),'total_tips',round(coalesce((SELECT sum(tips) FROM b),0),2),
 'tip_payouts',round((SELECT a FROM p),2),
 'cash_opening',round((SELECT a FROM o),2),'cash_movements',(SELECT a FROM movement),
 'expected_cash',round((SELECT a FROM o)+coalesce((SELECT sales+tips FROM b WHERE m='cash'),0)-(SELECT a FROM p)+(SELECT a FROM movement),2))
$function$;