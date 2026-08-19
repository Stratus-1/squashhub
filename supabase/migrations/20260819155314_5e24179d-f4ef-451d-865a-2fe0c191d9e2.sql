CREATE OR REPLACE FUNCTION public.enforce_tournament_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Backend / service-role context (edge functions, admin jobs) is trusted.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.can_manage_tournament(NEW.champ_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.club_member_id IS NOT NULL
     AND NOT public.is_member_eligible_for_tournament(NEW.champ_id, NEW.club_member_id)
  THEN
    RAISE EXCEPTION 'This member is not eligible to enter this tournament.';
  END IF;

  IF NEW.partner_member_id IS NOT NULL
     AND NOT public.is_member_eligible_for_tournament(NEW.champ_id, NEW.partner_member_id)
  THEN
    RAISE EXCEPTION 'The selected partner is not eligible to enter this tournament.';
  END IF;

  RETURN NEW;
END;
$$;