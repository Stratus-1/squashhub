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

  -- Path A: an existing club_member id was supplied (legacy import flow / CSIR)
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
    SET user_id                     = v_uid,
        email                       = COALESCE(NULLIF(v_norm_email, ''), email),
        phone                       = COALESCE(NULLIF(btrim(_phone), ''), phone),
        club_member_number          = COALESCE(v_norm_member_no, club_member_number),
        plays_league                = true,
        enable_league_association_id = COALESCE(enable_league_association_id, v_assoc_id),
        updated_at                  = now()
    WHERE id = v_match_id;

    RETURN v_match_id;
  END IF;

  -- Path B: claim directly from the platform league roster (no club_member yet)
  IF _club_id IS NULL THEN
    RAISE EXCEPTION 'Club id required for platform-roster claim';
  END IF;
  v_resolved_club_id := _club_id;

  SELECT plm.*, la.id AS la_id
    INTO plm_row
  FROM public.platform_league_members plm
  JOIN public.league_associations la ON la.id = plm.association_id
  WHERE upper(btrim(plm.league_association_number)) = v_norm_number
  LIMIT 1;

  IF plm_row IS NULL THEN
    RAISE EXCEPTION 'No member found with that league number';
  END IF;

  v_platform_assoc_id := plm_row.la_id;
  v_full_name := btrim(coalesce(plm_row.first_name, '') || ' ' || coalesce(plm_row.last_name, ''));

  INSERT INTO public.club_members (
    club_id, user_id, name, email, phone, gender,
    club_member_number, plays_league, enable_league_association_id, joined_at
  ) VALUES (
    v_resolved_club_id, v_uid, NULLIF(v_full_name, ''),
    NULLIF(v_norm_email, ''), NULLIF(btrim(_phone), ''), plm_row.gender,
    v_norm_member_no, true, v_platform_assoc_id, now()
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.member_association_affiliations (
    club_member_id, association_id, league_association_number, active
  ) VALUES (
    v_match_id, v_platform_assoc_id, v_norm_number, true
  )
  ON CONFLICT (club_member_id, association_id) DO UPDATE
    SET league_association_number = EXCLUDED.league_association_number,
        active = true,
        updated_at = now();

  RETURN v_match_id;
END;
$function$;