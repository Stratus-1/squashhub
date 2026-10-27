DO $migration$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public._bar_cash_up_summary(uuid,timestamptz,timestamptz)'::regprocedure) INTO def;
 IF position('cash_movements' IN def)=0 THEN
 def:=replace(def,
 'o AS (SELECT coalesce(sum(debit-credit),0) a FROM club_journal_entries WHERE club_id=_club AND account=''cash'' AND created_at<=_start)',
 'o AS (SELECT coalesce(sum(debit-credit),0) a FROM club_journal_entries WHERE club_id=_club AND account=''cash'' AND created_at<=_start),
 j AS (SELECT coalesce(sum(j.debit-j.credit),0) a FROM club_journal_entries j WHERE j.club_id=_club AND j.account=''cash'' AND j.created_at>_start AND j.created_at<=_end AND NOT EXISTS(SELECT 1 FROM bar_cash_ups c WHERE c.club_id=_club AND c.id=j.journal_ref)),
 movement AS (SELECT round((SELECT a FROM j)-coalesce((SELECT sales+tips FROM b WHERE m=''cash''),0)+(SELECT a FROM p),2) a)');
 def:=replace(def,'''cash_opening'',round((SELECT a FROM o),2),','''cash_opening'',round((SELECT a FROM o),2), ''cash_movements'',(SELECT a FROM movement),');
 def:=replace(def,'-(SELECT a FROM p),2))','-(SELECT a FROM p)+(SELECT a FROM movement),2))');
 IF position('movement AS' IN def)=0 THEN RAISE EXCEPTION 'Cash summary definition did not match'; END IF;
 EXECUTE def;
 END IF;
 SELECT pg_get_functiondef('public._bar_cash_up_reconcile_saved(uuid,boolean)'::regprocedure) INTO def;
 IF position('cash_movements' IN def)=0 THEN
 def:=replace(def,'prior_cash numeric; prior_bank numeric;', 'prior_cash numeric; prior_bank numeric; movements numeric;');
 def:=replace(def,'ec:=round(opening+', 'movements:=coalesce((c.totals->>''cash_movements'')::numeric,(_bar_cash_up_summary(c.club_id,c.period_start,c.period_end)->>''cash_movements'')::numeric,0); ec:=round(opening+movements+');
 def:=replace(def,'totals=jsonb_set(jsonb_set(coalesce(totals,''{}''::jsonb),''{cash_opening}'',to_jsonb(opening)),''{expected_cash}'',to_jsonb(ec))', 'totals=jsonb_set(jsonb_set(jsonb_set(coalesce(totals,''{}''::jsonb),''{cash_opening}'',to_jsonb(opening)),''{expected_cash}'',to_jsonb(ec)),''{cash_movements}'',to_jsonb(movements))');
 EXECUTE def;
 END IF;
END $migration$;
REVOKE ALL ON FUNCTION public._bar_cash_up_summary(uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._bar_cash_up_reconcile_saved(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._bar_cash_up_summary(uuid,timestamptz,timestamptz), public._bar_cash_up_reconcile_saved(uuid,boolean) TO service_role;