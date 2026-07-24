
CREATE OR REPLACE FUNCTION public.get_champ_signup_status(_champ_id uuid)
RETURNS TABLE(club_member_id uuid, has_account boolean, has_signed_in boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club_id uuid;
BEGIN
  SELECT club_id INTO _club_id FROM public.club_champs WHERE id = _champ_id;
  IF _club_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.is_club_admin_or_permitted(_club_id, 'manage_tournaments') AND NOT public.is_club_admin(_club_id) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  RETURN QUERY
  SELECT
    cm.id AS club_member_id,
    (cm.user_id IS NOT NULL) AS has_account,
    (u.last_sign_in_at IS NOT NULL) AS has_signed_in
  FROM public.club_champs_registrations r
  JOIN public.club_members cm ON cm.id = r.club_member_id
  LEFT JOIN auth.users u ON u.id = cm.user_id
  WHERE r.champ_id = _champ_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_champ_signup_status(uuid) TO authenticated;
