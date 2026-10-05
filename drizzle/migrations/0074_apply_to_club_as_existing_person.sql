CREATE OR REPLACE FUNCTION public.apply_to_club_as_existing_person(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_src record;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Club not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id AND user_id = v_uid AND status <> 'resigned'
  ) THEN
    RAISE EXCEPTION 'ALREADY_AT_CLUB: you already have a membership or application at this club';
  END IF;

  SELECT name, email, phone, gender, person_id INTO v_src
  FROM public.club_members
  WHERE user_id = v_uid AND club_id <> p_club_id AND status <> 'resigned'
  ORDER BY joined_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_EXISTING_MEMBERSHIP: use the normal new-member signup';
  END IF;

  INSERT INTO public.club_members
    (club_id, user_id, name, email, phone, gender, person_id, role, status, is_pending_approval, applied_at)
  VALUES
    (p_club_id, v_uid, v_src.name, v_src.email, v_src.phone, v_src.gender, v_src.person_id,
     'member', 'active', true, now())
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_to_club_as_existing_person(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_to_club_as_existing_person(uuid) TO authenticated;