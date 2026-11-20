CREATE OR REPLACE FUNCTION public.champ_fee_paid_settles_pairs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE reg record; pr record;
BEGIN
  IF NOT coalesce(NEW.paid, false) OR coalesce(OLD.paid, false) THEN RETURN NEW; END IF;
  FOR reg IN
    SELECT r.champ_id, r.club_member_id FROM public.club_champs_registrations r
     WHERE r.fee_payment_id = NEW.id OR (NEW.champ_registration_id IS NOT NULL AND r.id = NEW.champ_registration_id)
  LOOP
    FOR pr IN
      SELECT id FROM public.champ_doubles_pairs
       WHERE champ_id = reg.champ_id AND status IN ('pending','awaiting_payment')
         AND reg.club_member_id IN (member_a, member_b)
    LOOP
      PERFORM public.champ_pair_settle(pr.id);
    END LOOP;
  END LOOP;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.champ_fee_paid_settles_pairs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS champ_fee_paid_settles_pairs ON public.club_member_fee_payments;
CREATE TRIGGER champ_fee_paid_settles_pairs
AFTER UPDATE OF paid ON public.club_member_fee_payments
FOR EACH ROW EXECUTE FUNCTION public.champ_fee_paid_settles_pairs();

CREATE OR REPLACE FUNCTION public.champ_member_total_due_cents(p_champ_id uuid, p_member_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_reg uuid; v_total int := 0; pr record; v_partner uuid;
BEGIN
  SELECT id INTO v_reg FROM public.club_champs_registrations
   WHERE champ_id = p_champ_id AND club_member_id = p_member_id
     AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn') LIMIT 1;
  IF v_reg IS NULL THEN RETURN 0; END IF;
  IF public.champ_member_fee_paid(p_champ_id, p_member_id) THEN v_total := 0;
  ELSE v_total := coalesce(public.champ_reg_own_due_cents(v_reg), 0); END IF;
  -- Partner shares this member has promised to pay and that are still unpaid for THAT doubles event.
  FOR pr IN SELECT * FROM public.champ_doubles_pairs
             WHERE champ_id = p_champ_id AND pays_for_partner AND payer_member_id = p_member_id
               AND status NOT IN ('cancelled','declined') LOOP
    v_partner := CASE WHEN pr.member_a = p_member_id THEN pr.member_b ELSE pr.member_a END;
    IF v_partner IS NOT NULL
       AND NOT coalesce(public.champ_member_event_paid(p_champ_id, v_partner, pr.group_number), false) THEN
      v_total := v_total + coalesce(public.champ_division_fee_cents(p_champ_id, pr.group_number), 0);
    END IF;
  END LOOP;
  RETURN v_total;
END $function$;