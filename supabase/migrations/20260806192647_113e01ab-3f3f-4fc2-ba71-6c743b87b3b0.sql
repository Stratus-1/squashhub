CREATE OR REPLACE FUNCTION public.find_unclaimed_memberships()
 RETURNS TABLE(member_id uuid, club_id uuid, club_name text, club_slug text, member_name text, club_member_number text, league_numbers text, match_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      c.name::text AS club_name,
      c.subdomain::text AS club_slug,
      cm.name::text AS member_name,
      cm.club_member_number::text AS club_member_number,
      CASE
        WHEN lower(coalesce(cm.email, '')) = coalesce(_email, '~') OR lower(coalesce(cm.email, '')) = ANY (COALESCE(me.emails, ARRAY[]::text[])) THEN 'email'
        WHEN NULLIF(cm.id_number, '') = ANY (COALESCE(me.ids, ARRAY[]::text[])) THEN 'id_number'
        WHEN public.norm_phone_tail(cm.phone) = ANY (COALESCE(me.phones, ARRAY[]::text[])) THEN 'phone'
        ELSE 'name'
      END::text AS match_reason
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
    cand.member_name,
    cand.club_member_number,
    (
      SELECT string_agg(maa.league_association_number, ', ')
      FROM public.member_association_affiliations maa
      WHERE maa.club_member_id = cand.id
        AND maa.active
    )::text AS league_numbers,
    cand.match_reason
  FROM cand
  ORDER BY cand.club_name;
END;
$function$;