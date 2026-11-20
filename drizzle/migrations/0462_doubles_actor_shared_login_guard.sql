
CREATE OR REPLACE FUNCTION public.champ_actor_member(p_champ_id uuid, p_token text, p_verify text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_reg record; v_member uuid; v_count int;
BEGIN
  IF p_token IS NOT NULL AND length(p_token) >= 32 THEN
    SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
    IF NOT FOUND OR v_reg.invite_revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'This invitation link is not valid';
    END IF;
    IF p_champ_id IS NOT NULL AND v_reg.champ_id <> p_champ_id THEN
      RAISE EXCEPTION 'This invitation link is not valid';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = v_reg.club_member_id AND m.user_id = auth.uid()) THEN
      IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
        RAISE EXCEPTION 'We could not verify that this invitation is yours. Please check the detail you entered.';
      END IF;
    END IF;
    RETURN v_reg.club_member_id;
  END IF;

  -- No invitation token: only unambiguous when this login has one live entry.
  -- Shared family logins must say which player they act for (never a random LIMIT 1).
  SELECT count(DISTINCT r.club_member_id), min(r.club_member_id::text)::uuid
    INTO v_count, v_member
    FROM public.club_champs_registrations r
    JOIN public.club_members m ON m.id = r.club_member_id
   WHERE r.champ_id = p_champ_id AND m.user_id = auth.uid()
     AND lower(COALESCE(r.status,'')) NOT IN ('cancelled','declined','withdrawn');
  IF COALESCE(v_count, 0) > 1 THEN
    RAISE EXCEPTION 'Several players share this login. Please open the partner choice from the player''s own invitation.';
  END IF;
  IF v_member IS NULL THEN
    SELECT r.club_member_id INTO v_member
      FROM public.club_champs_registrations r
      JOIN public.club_members m ON m.id = r.club_member_id
     WHERE r.champ_id = p_champ_id AND m.user_id = auth.uid()
     LIMIT 1;
  END IF;
  IF v_member IS NULL THEN RAISE EXCEPTION 'You are not registered for this tournament'; END IF;
  RETURN v_member;
END; $function$;
