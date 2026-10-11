CREATE OR REPLACE FUNCTION public.derive_champ_registration_statuses()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_fee integer; v_timing text; s text := lower(coalesce(NEW.status,''));
  v_money boolean; v_fee_ok boolean; v_entry_ok boolean;
BEGIN
  SELECT coalesce(entry_fee_cents,0), coalesce(payment_timing,'on_entry') INTO v_fee, v_timing FROM club_champs WHERE id = NEW.champ_id;
  v_money := NEW.paid_at IS NOT NULL OR coalesce(NEW.fee_paid_cents,0) > 0;
  NEW.fee_status := CASE
    WHEN s = 'waived' THEN 'waived'
    WHEN v_money THEN 'paid'
    WHEN coalesce(v_fee,0) <= 0 THEN 'not_required'
    WHEN s = 'paid' THEN 'paid'
    WHEN NEW.fee_settled_via = 'account' THEN 'on_account'
    WHEN s = 'pending_eft' THEN 'pending'
    ELSE 'due' END;
  v_fee_ok := NEW.fee_status IN ('paid','waived','not_required','on_account');
  -- "Must the fee be paid before the entry is confirmed?" = No (after_acceptance):
  -- payment never gates the entry; the fee stays tracked separately in fee_status.
  v_entry_ok := v_fee_ok OR v_timing = 'after_acceptance';
  IF s IN ('cancelled','declined','withdrawn') THEN
    NEW.registration_status := 'declined';
  ELSIF NEW.registration_source = 'organiser' AND (v_entry_ok OR s IN ('paid','waived')) THEN
    NEW.registration_status := 'registered';
  ELSIF s IN ('paid','waived','registered','active') OR (NEW.confirmed_at IS NOT NULL AND v_entry_ok) THEN
    NEW.registration_status := 'registered';
  ELSE
    NEW.registration_status := 'invited';
  END IF;
  IF NEW.registration_status = 'registered' AND NEW.registration_source IS NULL THEN
    NEW.registration_source := CASE WHEN NEW.confirmed_at IS NOT NULL THEN 'player' ELSE 'organiser' END;
  END IF;
  RETURN NEW;
END $function$;