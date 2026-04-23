CREATE OR REPLACE FUNCTION public.claim_member_by_league_number(
  _club_member_id uuid,
  _league_number text,
  _email text,
  _phone text DEFAULT NULL::text,
  _club_id uuid DEFAULT NULL::uuid,
  _club_member_number text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_norm_number text := upper(btrim(coalesce(_league_number, '')));
  v_norm_email text := lower(btrim(coalesce(_email, '')));
  v_norm_member_no text := nullif(btrim(coalesce(_club_member_number, '')), '');
  v_match_id uuid;
  v_resolved_club_id uuid;
  v_assoc_id uuid;
  v_platform_assoc_id uuid;
  v_full_name text;
  plm_row record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_norm_number = '' THEN
    RAISE EXCEPTION 'Missing league number';
  END IF;

  IF _club_member_id IS NOT NULL THEN
    SELECT cm.id, maa.association_id
      INTO v_match_id, v_assoc_id
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
    SET user_id                      = v_uid,
        email                        = COALESCE(NULLIF(v_norm_email, ''), email),
        phone                        = COALESCE(NULLIF(btrim(_phone), ''), phone),
        club_member_number           = COALESCE(v_norm_member_no, club_member_number),
        plays_league                 = true,
        enable_league_association_id = COALESCE(enable_league_association_id, v_assoc_id),
        updated_at                   = now()
    WHERE id = v_match_id;

    RETURN v_match_id;
  END IF;

  IF _club_id IS NULL THEN
    RAISE EXCEPTION 'Club id required when claiming from league roster';
  END IF;
  v_resolved_club_id := _club_id;

  SELECT la.id, la.platform_association_id
    INTO v_assoc_id, v_platform_assoc_id
  FROM public.league_associations la
  JOIN public.platform_league_members plm
    ON plm.association_id = la.platform_association_id
  WHERE la.club_id = v_resolved_club_id
    AND la.active = true
    AND upper(btrim(plm.user_code)) = v_norm_number
    AND plm.user_state = 'ACTIVE'
  LIMIT 1;

  IF v_assoc_id IS NULL THEN
    RAISE EXCEPTION 'No league member matches that number for this club';
  END IF;

  SELECT * INTO plm_row
  FROM public.platform_league_members
  WHERE association_id = v_platform_assoc_id
    AND upper(btrim(user_code)) = v_norm_number
  LIMIT 1;

  v_full_name := btrim(coalesce(plm_row.first_name, '') || ' ' || coalesce(plm_row.surname, ''));
  IF v_full_name = '' THEN
    v_full_name := 'Member';
  END IF;

  SELECT cm.id
    INTO v_match_id
  FROM public.club_members cm
  JOIN public.member_association_affiliations maa ON maa.club_member_id = cm.id
  WHERE cm.club_id = v_resolved_club_id
    AND maa.association_id = v_assoc_id
    AND upper(btrim(maa.league_association_number)) = v_norm_number
    AND cm.user_id IS NULL
  LIMIT 1;

  IF v_match_id IS NULL THEN
    INSERT INTO public.club_members (
      club_id,
      user_id,
      name,
      email,
      phone,
      plays_league,
      joined_at,
      role,
      club_member_number,
      enable_league_association_id
    ) VALUES (
      v_resolved_club_id,
      v_uid,
      v_full_name,
      NULLIF(v_norm_email, ''),
      NULLIF(btrim(_phone), ''),
      true,
      now(),
      'member',
      v_norm_member_no,
      v_assoc_id
    )
    RETURNING id INTO v_match_id;

    INSERT INTO public.member_association_affiliations (
      club_member_id,
      association_id,
      league_association_number,
      active
    ) VALUES (
      v_match_id,
      v_assoc_id,
      v_norm_number,
      true
    )
    ON CONFLICT (club_member_id, association_id) DO UPDATE
      SET league_association_number = EXCLUDED.league_association_number,
          active = true,
          updated_at = now();
  ELSE
    UPDATE public.club_members
    SET user_id                      = v_uid,
        email                        = COALESCE(NULLIF(v_norm_email, ''), email),
        phone                        = COALESCE(NULLIF(btrim(_phone), ''), phone),
        name                         = CASE WHEN name IS NULL OR name = '' THEN v_full_name ELSE name END,
        club_member_number           = COALESCE(v_norm_member_no, club_member_number),
        plays_league                 = true,
        enable_league_association_id = COALESCE(enable_league_association_id, v_assoc_id),
        updated_at                   = now()
    WHERE id = v_match_id;
  END IF;

  RETURN v_match_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_member_by_league_number(uuid, text, text, text, uuid, text) TO authenticated;