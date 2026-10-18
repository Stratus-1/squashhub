CREATE OR REPLACE FUNCTION public.bar_item_income_account(_club uuid, _item uuid)
RETURNS public.gl_account LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public.bar_items WHERE id=_item AND club_id=_club AND division='shop') THEN 'shop_income'::public.gl_account ELSE 'bar_income'::public.gl_account END;
$fn$;
REVOKE ALL ON FUNCTION public.bar_item_income_account(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bar_item_income_account(uuid,uuid) TO authenticated,service_role;
DO $patch$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.bar_tab_entry_journal()'::regprocedure);
 IF position('(NEW.club_id, NEW.id, ''bar_income''' IN d)=0 THEN RAISE EXCEPTION 'Unexpected member sale journal definition'; END IF;
 d:=replace(d,'(NEW.club_id, NEW.id, ''bar_income''','(NEW.club_id, NEW.id, public.bar_item_income_account(NEW.club_id, NEW.bar_item_id)');
 EXECUTE d;
 d:=pg_get_functiondef('public.bar_post_sale_journal(public.bar_visitor_sales)'::regprocedure);
 IF position('SELECT s.total, s.quantity, i.name' IN d)=0 THEN RAISE EXCEPTION 'Unexpected visitor sale journal definition'; END IF;
 d:=replace(d,'(_sale.club_id, _sale.id, ''bar_income''','(_sale.club_id, _sale.id, public.bar_item_income_account(_sale.club_id, _sale.bar_item_id)');
 d:=replace(d,'SELECT s.total, s.quantity, i.name','SELECT s.total, s.quantity, i.name, public.bar_item_income_account(s.club_id, s.bar_item_id) AS income_account');
 d:=replace(d,'(_sale.club_id, v_ref, ''bar_income''','(_sale.club_id, v_ref, r.income_account');
 EXECUTE d;
 d:=pg_get_functiondef('public.check_ledger_integrity(uuid)'::regprocedure);
 d:=replace(d,'''light_fees_income'',''bar_income''','''light_fees_income'',''bar_income'',''shop_income''');
 EXECUTE d;
END $patch$;
CREATE OR REPLACE FUNCTION public.journal_division_stock_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_div text; v_exp public.gl_account; v_offset public.gl_account; v_total numeric; v_desc text;
BEGIN
 SELECT division INTO v_div FROM public.bar_items WHERE id=NEW.bar_item_id AND club_id=NEW.club_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item does not belong to this club'; END IF;
 v_total:=COALESCE(NULLIF(NEW.total_cost,0),NEW.unit_cost*NEW.quantity);
 IF v_total IS NULL OR v_total<=0 THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.club_journal_entries WHERE club_id=NEW.club_id AND journal_ref=NEW.id) THEN RETURN NEW; END IF;
 v_exp:=CASE WHEN v_div='shop' THEN 'shop_expense'::public.gl_account ELSE 'bar_expense'::public.gl_account END;
 v_offset:=CASE WHEN NEW.payment_method='account' THEN 'creditors'::public.gl_account WHEN NEW.payment_method='cash' THEN 'cash'::public.gl_account ELSE 'bank_current'::public.gl_account END;
 v_desc:=CASE WHEN v_div='shop' THEN 'Shop purchases' ELSE 'Bar purchases' END || COALESCE(' — '||NULLIF(NEW.invoice_number,''),'');
 INSERT INTO public.club_journal_entries(club_id,journal_ref,account,debit,credit,description,created_at) VALUES
 (NEW.club_id,NEW.id,v_exp,v_total,0,v_desc,COALESCE(NEW.invoice_date::timestamptz,NEW.created_at)),
 (NEW.club_id,NEW.id,v_offset,0,v_total,v_desc,COALESCE(NEW.invoice_date::timestamptz,NEW.created_at));
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.journal_division_stock_purchase() FROM PUBLIC;
CREATE TRIGGER trg_division_purchase_journal AFTER INSERT ON public.bar_stock_purchases FOR EACH ROW EXECUTE FUNCTION public.journal_division_stock_purchase();