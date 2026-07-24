CREATE OR REPLACE FUNCTION public.get_champ_signup_status(_champ_id uuid)
RETURNS TABLE(club_member_id uuid, has_account boolean, has_signed_in boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _club_id uuid;
BEGIN
  SELECT club_id INTO _club_id FROM public.club_champs WHERE id = _champ_id;
  IF _club_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.is_club_admin(auth.uid(), _club_id)
     AND NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'manage_tournaments') THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  RETURN QUERY
  WITH regs AS (
    SELECT cm.id AS member_id, cm.user_id, cm.email
    FROM public.club_champs_registrations r
    JOIN public.club_members cm ON cm.id = r.club_member_id
    WHERE r.champ_id = _champ_id
  )
  SELECT
    regs.member_id,
    (regs.user_id IS NOT NULL) AS has_account,
    -- signed in if this user_id has signed in, OR any auth user with same email has signed in (shared logins)
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.last_sign_in_at IS NOT NULL
        AND (u.id = regs.user_id OR (regs.email IS NOT NULL AND lower(u.email) = lower(regs.email)))
    ) AS has_signed_in
  FROM regs;
END;
$function$;