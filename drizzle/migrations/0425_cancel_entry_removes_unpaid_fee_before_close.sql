CREATE OR REPLACE FUNCTION public.tg_registration_cancel_unpaid_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_champ record;
  v_cutoff timestamptz;
  f record;
  v_club uuid;
BEGIN
  IF lower(coalesce(NEW.status,'')) NOT IN ('cancelled','declined','withdrawn')
     OR lower(coalesce(OLD.status,'')) IN ('cancelled','declined','withdrawn')
     OR OLD.fee_payment_id IS NULL
     OR coalesce(NEW.withdrawn_keep_position, false) THEN
    RETURN NULL;
  END IF;

  SELECT registration_closes_at, start_date, coalesce(entries_locked,false) AS entries_locked
    INTO v_champ FROM public.club_champs WHERE id = NEW.champ_id;
  IF NOT FOUND OR v_champ.entries_locked THEN RETURN NULL; END IF;
  v_cutoff := coalesce(v_champ.registration_closes_at, v_champ.start_date::timestamptz);
  IF v_cutoff IS NOT NULL AND now() > v_cutoff THEN RETURN NULL; END IF;

  SELECT * INTO f FROM public.club_member_fee_payments WHERE id = OLD.fee_payment_id FOR UPDATE;
  IF NOT FOUND OR f.paid OR f.fee_type <> 'tournament_entry'
     OR f.invoice_issued_at IS NOT NULL OR coalesce(f.settled_from_wallet,false)
     OR f.paid_by_member_id IS NOT NULL THEN
    RETURN NULL;
  END IF;
  -- Never remove a fee that received any money or credit, or that another live entry still uses.
  IF EXISTS (SELECT 1 FROM public.club_journal_entries WHERE fee_payment_id = f.id
               AND account NOT IN ('debtors','tournament_income'))
     OR EXISTS (SELECT 1 FROM public.member_credit_transactions WHERE fee_payment_id = f.id)
     OR EXISTS (SELECT 1 FROM public.club_member_fee_payments WHERE linked_fee_payment_id = f.id)
     OR EXISTS (SELECT 1 FROM public.club_champs_registrations r WHERE r.fee_payment_id = f.id AND r.id <> NEW.id
                  AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn'))
     OR (SELECT coalesce(sum(credit - debit),0) FROM public.club_journal_entries
           WHERE fee_payment_id = f.id AND account = 'tournament_income') <> f.amount THEN
    RETURN NULL;
  END IF;

  SELECT club_id INTO v_club FROM public.club_members WHERE id = f.club_member_id;
  BEGIN
    PERFORM public._champ_fee_adjust(f.id, 0, 'Entry cancelled before entries closed: unpaid entry fee removed');
    INSERT INTO public.audit_events (club_id, actor_user_id, actor_label, entity_type, entity_id, action, reason, before_data, after_data)
    VALUES (v_club, auth.uid(), 'system', 'club_member_fee_payments', f.id, 'tournament_entry_fee_removed',
            'Entry cancelled before the entry closing date; unpaid entry fee removed automatically',
            to_jsonb(f), jsonb_build_object('registration_id', NEW.id, 'champ_id', NEW.champ_id, 'removed', true));
  EXCEPTION WHEN insufficient_privilege THEN
    -- e.g. chairman (finance view-only): keep the cancellation, leave the fee for a finance admin.
    NULL;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_registration_cancel_unpaid_fee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_registration_cancel_unpaid_fee ON public.club_champs_registrations;
CREATE TRIGGER trg_registration_cancel_unpaid_fee
AFTER UPDATE OF status ON public.club_champs_registrations
FOR EACH ROW EXECUTE FUNCTION public.tg_registration_cancel_unpaid_fee();