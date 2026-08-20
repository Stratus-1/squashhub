CREATE OR REPLACE FUNCTION public.ensure_tournament_invite_tokens(p_champ_id uuid)
RETURNS TABLE (registration_id uuid, club_member_id uuid, invite_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_tournament(auth.uid(), p_champ_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this tournament';
  END IF;

  UPDATE public.club_champs_registrations r
     SET invite_token = public.new_invite_token(),
         invite_token_created_at = now()
   WHERE r.champ_id = p_champ_id
     AND r.invite_token IS NULL;

  RETURN QUERY
    SELECT r.id, r.club_member_id, r.invite_token
      FROM public.club_champs_registrations r
     WHERE r.champ_id = p_champ_id
       AND r.invite_token IS NOT NULL
       AND r.invite_revoked_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_tournament_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.can_manage_tournament(auth.uid(), NEW.champ_id) THEN
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

GRANT EXECUTE ON FUNCTION public.ensure_tournament_invite_tokens(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_tournament_eligibility() TO authenticated, service_role;