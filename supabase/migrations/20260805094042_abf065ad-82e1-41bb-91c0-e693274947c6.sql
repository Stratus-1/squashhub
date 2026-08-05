
-- Normalise a person name for fuzzy comparison
CREATE OR REPLACE FUNCTION public.norm_person_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(lower(coalesce(_name, '')), '[^a-z]', '', 'g')
$$;

-- Last 9 digits of a phone number (SA numbers with/without country code)
CREATE OR REPLACE FUNCTION public.norm_phone_tail(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(right(regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g'), 9), '')
$$;

-- Suggest unclaimed club memberships that look like they belong to the caller
CREATE OR REPLACE FUNCTION public.find_unclaimed_memberships()
RETURNS TABLE (
  member_id uuid,
  club_id uuid,
  club_name text,
  club_slug text,
  member_name text,
  club_member_number text,
  league_numbers text,
  match_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;

  SELECT lower(p.email) INTO _email FROM public.profiles p WHERE p.id = _uid;

  RETURN QUERY
  WITH me AS (
    SELECT
      array_remove(array_agg(DISTINCT public.norm_person_name(cm.name)), '') AS names,
      array_remove(array_agg(DISTINCT public.norm_phone_tail(cm.phone)), NULL) AS phones,
      array_remove(array_agg(DISTINCT NULLIF(cm.id_number, '')), NULL) AS ids,
      array_remove(array_agg(DISTINCT lower(NULLIF(cm.email, ''))), NULL) AS emails,
      array_remove(array_agg(DISTINCT cm.club_id::text), NULL) AS clubs
    FROM public.club_members cm
    WHERE cm.user_id = _uid
  ),
  cand AS (
    SELECT
      cm.id,
      cm.club_id,
      c.name AS club_name,
      c.slug AS club_slug,
      cm.name,
      cm.club_member_number,
      CASE
        WHEN lower(coalesce(cm.email, '')) = coalesce(_email, '~') OR lower(coalesce(cm.email, '')) = ANY (COALESCE(me.emails, ARRAY[]::text[])) THEN 'email'
        WHEN NULLIF(cm.id_number, '') = ANY (COALESCE(me.ids, ARRAY[]::text[])) THEN 'id_number'
        WHEN public.norm_phone_tail(cm.phone) = ANY (COALESCE(me.phones, ARRAY[]::text[])) THEN 'phone'
        ELSE 'name'
      END AS match_reason
    FROM public.club_members cm
    JOIN public.clubs c ON c.id = cm.club_id
    CROSS JOIN me
    WHERE cm.user_id IS NULL
      AND cm.status = 'active'
      AND cm.role <> 'visitor'
      AND NOT (cm.club_id::text = ANY (COALESCE(me.clubs, ARRAY[]::text[])))
      AND (
        (NULLIF(lower(cm.email), '') IS NOT NULL AND (lower(cm.email) = coalesce(_email, '~') OR lower(cm.email) = ANY (COALESCE(me.emails, ARRAY[]::text[]))))
        OR (NULLIF(cm.id_number, '') IS NOT NULL AND cm.id_number = ANY (COALESCE(me.ids, ARRAY[]::text[])))
        OR (public.norm_phone_tail(cm.phone) IS NOT NULL AND public.norm_phone_tail(cm.phone) = ANY (COALESCE(me.phones, ARRAY[]::text[])))
        OR (public.norm_person_name(cm.name) <> '' AND public.norm_person_name(cm.name) = ANY (COALESCE(me.names, ARRAY[]::text[])))
      )
  )
  SELECT
    cand.id,
    cand.club_id,
    cand.club_name,
    cand.club_slug,
    cand.name,
    cand.club_member_number,
    (
      SELECT string_agg(maa.league_number, ', ')
      FROM public.member_association_affiliations maa
      WHERE maa.club_member_id = cand.id
    ) AS league_numbers,
    cand.match_reason
  FROM cand
  ORDER BY cand.club_name;
END;
$$;

REVOKE ALL ON FUNCTION public.find_unclaimed_memberships() FROM public;
GRANT EXECUTE ON FUNCTION public.find_unclaimed_memberships() TO authenticated;

-- Link one of those suggested records to the caller's login
CREATE OR REPLACE FUNCTION public.claim_unclaimed_membership(_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ok boolean;
  _email text;
  _club uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.find_unclaimed_memberships() f WHERE f.member_id = _member_id
  ) INTO _ok;

  IF NOT _ok THEN
    RAISE EXCEPTION 'This membership cannot be linked to your account';
  END IF;

  SELECT lower(p.email) INTO _email FROM public.profiles p WHERE p.id = _uid;

  UPDATE public.club_members cm
  SET user_id = _uid,
      email = COALESCE(NULLIF(cm.email, ''), _email),
      updated_at = now()
  WHERE cm.id = _member_id
    AND cm.user_id IS NULL
  RETURNING cm.club_id INTO _club;

  IF _club IS NULL THEN
    RAISE EXCEPTION 'This membership has already been claimed';
  END IF;

  RETURN jsonb_build_object('success', true, 'club_id', _club, 'member_id', _member_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_unclaimed_membership(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_unclaimed_membership(uuid) TO authenticated;
