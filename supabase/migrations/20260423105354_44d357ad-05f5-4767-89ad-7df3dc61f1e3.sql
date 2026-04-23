
-- Allow lookup to fall back to platform_league_members (imported league roster) so
-- existing league members can sign up at their club even if they were never imported
-- as a club_member yet.
CREATE OR REPLACE FUNCTION public.lookup_member_by_league_number(_club_id uuid, _league_number text)
RETURNS TABLE(id uuid, masked_name text, association_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  norm_number text := upper(btrim(coalesce(_league_number, '')));
BEGIN
  IF _club_id IS NULL OR norm_number = '' THEN
    RETURN;
  END IF;

  -- 1) Existing club_member already affiliated with the association
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

  IF FOUND THEN
    RETURN;
  END IF;

  -- 2) Fallback: imported platform league roster entry for an association linked to this club.
  --    Return id = NULL to signal "no club_member yet — claim will create one".
  RETURN QUERY
  SELECT
    NULL::uuid AS id,
    CASE
      WHEN COALESCE(plm.first_name, '') = '' AND COALESCE(plm.surname, '') = '' THEN 'Member'
      WHEN COALESCE(plm.first_name, '') = '' THEN plm.surname
      ELSE plm.first_name || ' ' || left(COALESCE(plm.surname, ''), 1) || '.'
    END AS masked_name,
    la.name AS association_name
  FROM public.platform_league_members plm
  JOIN public.league_associations la
    ON la.platform_association_id = plm.association_id
   AND la.club_id = _club_id
   AND la.active = true
  WHERE upper(btrim(plm.user_code)) = norm_number
    AND plm.user_state = 'ACTIVE'
    AND NOT EXISTS (
      SELECT 1
      FROM public.member_association_affiliations maa2
      JOIN public.club_members cm2 ON cm2.id = maa2.club_member_id
      WHERE cm2.club_id = _club_id
        AND maa2.association_id = la.id
        AND upper(btrim(maa2.league_association_number)) = norm_number
        AND cm2.user_id IS NOT NULL
    )
  LIMIT 1;
END;
$function$;


-- Update claim function to allow _club_member_id to be NULL when claiming from
-- the imported platform league roster. In that case, we look up the platform row
-- by (club, league number), create a club_member, link the affiliation, and
-- attach the user.
CREATE OR REPLACE FUNCTION public.claim_member_by_league_number(
  _club_member_id uuid,
  _league_number text,
  _email text,
  _phone text DEFAULT NULL::text,
  _club_id uuid DEFAULT NULL::uuid
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

  -- Path A: an existing club_member id was supplied (legacy import flow)
  IF _club_member_id IS NOT NULL THEN
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
  END IF;

  -- Path B: claim directly from the platform league roster.
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
  IF v_full_name = '' THEN v_full_name := 'Member'; END IF;

  -- Reuse any existing club_member with same league number (in case affiliation already exists)
  SELECT cm.id INTO v_match_id
  FROM public.club_members cm
  JOIN public.member_association_affiliations maa ON maa.club_member_id = cm.id
  WHERE cm.club_id = v_resolved_club_id
    AND maa.association_id = v_assoc_id
    AND upper(btrim(maa.league_association_number)) = v_norm_number
    AND cm.user_id IS NULL
  LIMIT 1;

  IF v_match_id IS NULL THEN
    INSERT INTO public.club_members (
      club_id, user_id, name, email, phone, plays_league, joined_at, role
    ) VALUES (
      v_resolved_club_id,
      v_uid,
      v_full_name,
      NULLIF(v_norm_email, ''),
      NULLIF(btrim(_phone), ''),
      true,
      now(),
      'member'
    )
    RETURNING id INTO v_match_id;

    INSERT INTO public.member_association_affiliations (
      club_member_id, association_id, league_association_number, active
    ) VALUES (
      v_match_id, v_assoc_id, v_norm_number, true
    )
    ON CONFLICT (club_member_id, association_id) DO UPDATE
      SET league_association_number = EXCLUDED.league_association_number,
          active = true,
          updated_at = now();
  ELSE
    UPDATE public.club_members
    SET user_id    = v_uid,
        email      = COALESCE(NULLIF(v_norm_email, ''), email),
        phone      = COALESCE(NULLIF(btrim(_phone), ''), phone),
        name       = CASE WHEN name IS NULL OR name = '' THEN v_full_name ELSE name END,
        updated_at = now()
    WHERE id = v_match_id;
  END IF;

  RETURN v_match_id;
END;
$function$;
