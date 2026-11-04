CREATE OR REPLACE FUNCTION public._settle_member_renewal_invoices(_member uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_club uuid; v_start timestamptz; v_avail numeric; v_used numeric; r record; v_n int := 0;
BEGIN
  SELECT club_id INTO v_club FROM club_members WHERE id = _member;
  IF v_club IS NULL THEN RETURN 0; END IF;
  SELECT min(invoice_issued_at) INTO v_start FROM club_member_fee_payments
   WHERE club_member_id = _member AND fee_type = 'renewal' AND NOT paid AND invoice_issued_at IS NOT NULL;
  IF v_start IS NULL THEN RETURN 0; END IF;
  -- Money received since the oldest open invoice: unallocated payments, or payments already linked to these invoices
  SELECT COALESCE(sum(j.credit),0) INTO v_avail FROM club_journal_entries j
   WHERE j.club_id = v_club AND j.club_member_id = _member AND j.account = 'debtors' AND j.credit > 0
     AND j.reverses_journal_ref IS NULL AND j.created_at >= v_start
     AND NOT EXISTS (SELECT 1 FROM club_journal_entries x WHERE x.reverses_journal_ref = j.journal_ref)
     AND (j.fee_payment_id IS NULL OR j.fee_payment_id IN (
           SELECT id FROM club_member_fee_payments WHERE club_member_id = _member AND fee_type='renewal' AND invoice_issued_at IS NOT NULL));
  -- Less what earlier auto-settlements in this window already used
  SELECT COALESCE(sum(f.amount),0) INTO v_used FROM club_member_fee_payments f
   WHERE f.club_member_id = _member AND f.fee_type='renewal' AND f.paid AND f.settled_from_wallet
     AND f.invoice_issued_at >= v_start;
  v_avail := v_avail - v_used;
  FOR r IN SELECT f.id, f.amount FROM club_member_fee_payments f
            WHERE f.club_member_id = _member AND f.fee_type='renewal' AND NOT f.paid AND f.invoice_issued_at IS NOT NULL
            ORDER BY f.invoice_issued_at, f.created_at FOR UPDATE LOOP
    EXIT WHEN v_avail < r.amount OR r.amount <= 0;
    -- settled_from_wallet: money is already banked, so no second bank receipt is posted
    UPDATE club_member_fee_payments SET paid = true, paid_at = now(), settled_from_wallet = true WHERE id = r.id;
    v_avail := v_avail - r.amount; v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public._settle_member_renewal_invoices(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_settle_renewals_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.account = 'debtors' AND NEW.credit > 0 AND NEW.club_member_id IS NOT NULL AND pg_trigger_depth() < 3 THEN
    PERFORM public._settle_member_renewal_invoices(NEW.club_member_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_settle_renewals_on_payment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_settle_renewals_on_payment ON public.club_journal_entries;
CREATE TRIGGER trg_settle_renewals_on_payment AFTER INSERT ON public.club_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_settle_renewals_on_payment();