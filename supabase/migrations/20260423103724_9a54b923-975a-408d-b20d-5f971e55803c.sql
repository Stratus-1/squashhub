
CREATE OR REPLACE FUNCTION public.lookup_member_by_league_number(
  _club_id uuid,
  _league_number text
)
RETURNS TABLE(id uuid, masked_name text, association_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  norm_number text := upper(btrim(coalesce(_league_number, '')));
BEGIN
  IF _club_id IS NULL OR norm_number = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cm.id,
    CASE
      WHEN cm.name IS NULL OR cm.name = '' THEN 'Member'
      WHEN position(' ' in cm.name) = 0 THEN cm.name
      ELSE split_part(cm.name, ' ', 1) || ' ' || left(split_part(cm.name, ' ', 2), 1) || '.'
    END AS masked_name,
    la.name AS association_name
  FROM public.member_association_affiliations maa
  JOIN public.club_members cm ON cm.id = maa.club_member_id
  JOIN public.league_associations la ON la.id = maa.association_id
  WHERE cm.club_id = _club_id
    AND cm.user_id IS NULL
    AND maa.active = true
    AND upper(btrim(maa.league_association_number)) = norm_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_member_by_league_number(
  _club_member_id uuid,
  _league_number text,
  _email text,
  _phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_norm_number text := upper(btrim(coalesce(_league_number, '')));
  v_norm_email text := lower(btrim(coalesce(_email, '')));
  v_match_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _club_member_id IS NULL OR v_norm_number = '' THEN
    RAISE EXCEPTION 'Missing club member or league number';
  END IF;

  SELECT cm.id INTO v_match_id
  FROM public.club_members cm
  JOIN public.member_association_affiliations maa ON maa.club_member_id = cm.id
  WHERE cm.id = _club_member_id
    AND cm.user_id IS NULL
    AND maa.active = true
    AND upper(btrim(maa.league_association_number)) = v_norm_number
  LIMIT 1;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'No unlinked member matches that league number';
  END IF;

  UPDATE public.club_members
  SET user_id    = v_uid,
      email      = COALESCE(NULLIF(v_norm_email, ''), email),
      phone      = COALESCE(NULLIF(btrim(_phone), ''), phone),
      updated_at = now()
  WHERE id = v_match_id;

  RETURN v_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_member_by_league_number(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.claim_member_by_league_number(uuid, text, text, text) TO authenticated;
