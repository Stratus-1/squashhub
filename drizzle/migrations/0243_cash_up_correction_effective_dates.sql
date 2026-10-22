DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public._bar_cash_up_reconcile_saved(uuid,boolean)'::regprocedure) INTO def;
 def:=replace(def,'account,debit,credit,description) VALUES','account,debit,credit,description,created_at) VALUES');
 def:=replace(def,'''Audited cash-up reconciliation correction'')','''Audited cash-up reconciliation correction'',c.period_end)');
 def:=replace(def,'''Audited cash-up card reconciliation correction'')','''Audited cash-up card reconciliation correction'',c.period_end)');
 EXECUTE def;
 SELECT pg_get_functiondef('public.bar_cash_up_admin_correct_full(uuid,numeric,numeric,text,text,jsonb,boolean,jsonb)'::regprocedure) INTO def;
 def:=replace(def,'account,debit,credit,description) VALUES','account,debit,credit,description,created_at) VALUES');
 def:=replace(def,'''Audited paid-tip correction: ''||s.label)','''Audited paid-tip correction: ''||s.label,c.period_end)');
 EXECUTE def;
 SELECT pg_get_functiondef('public.bar_cash_up_edit_staff(uuid)'::regprocedure) INTO def;
 def:=replace(def,'t.created_at<=c.period_end','coalesce(t.earned_at,t.created_at)<=c.period_end');
 EXECUTE def;
END $$;