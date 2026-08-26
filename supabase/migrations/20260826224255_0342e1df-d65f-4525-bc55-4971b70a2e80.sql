-- Drop the existing function first because we are widening the RETURN TABLE signature.
DROP FUNCTION IF EXISTS public.tournament_invite_directory(uuid, uuid, text, text, integer, uuid[]);

-- Add an 'already a registered SquashHub user' flag to the privacy-safe tournament invite directory.
-- club_members.user_id is non-null exactly when the member record is linked to an auth account.
CREATE OR REPLACE FUNCTION public.tournament_invite_directory(
  p_tournament_id uuid DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_club_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  member_id uuid,
  display_name text,
  club_id uuid,
  club_name text,
  gender text,
  ladder_position integer,
  ranking_points numeric,
  is_own_club boolean,
  invite_status text,
  is_user boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _club uuid := p_club_id;
  _owner uuid;
  _scope text := p_scope;
  _q text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  _lim integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF p_tournament_id IS NOT NULL THEN
    SELECT t.club_id, t.owner_org_id INTO _club, _owner
    FROM public.tournaments t WHERE t.id = p_tournament_id;
    IF _club IS NULL AND _owner IS NULL THEN
      RAISE EXCEPTION 'Tournament not found';
    END IF;
    SELECT g.eligibility_scope INTO _scope
    FROM public.tournament_governance g WHERE g.tournament_id = p_tournament_id;
  ELSIF _club IS NULL THEN
    RAISE EXCEPTION 'A club or tournament is required';
  END IF;

  IF NOT public.can_browse_invite_directory(_uid, p_tournament_id, _club) THEN
    RAISE EXCEPTION 'Not authorised to browse the player directory for this tournament';
  END IF;

  _scope := COALESCE(_scope, p_scope, 'club');

  RETURN QUERY
  SELECT
    m.id,
    COALESCE(NULLIF(BTRIM(m.name), ''), 'Unknown player')::text,
    m.club_id,
    COALESCE(c.name, '')::text,
    m.gender,
    m.ladder_position,
    m.ranking_points,
    (m.club_id = _club),
    r.status::text,
    (m.user_id IS NOT NULL)
  FROM public.club_members m
  JOIN public.scope_eligible_club_ids(_club, _owner, _scope) e ON e.club_id = m.club_id
  LEFT JOIN public.clubs c ON c.id = m.club_id
  LEFT JOIN public.club_champs_registrations r
         ON p_tournament_id IS NOT NULL
        AND r.champ_id = p_tournament_id
        AND r.club_member_id = m.id
  WHERE m.status = 'active'
    AND m.role <> 'visitor'
    AND COALESCE(m.billing_exempt, false) = false
    AND (p_club_ids IS NULL OR m.club_id = ANY(p_club_ids))
    AND (_q IS NULL OR m.name ILIKE '%' || _q || '%' OR COALESCE(c.name, '') ILIKE '%' || _q || '%')
  ORDER BY (m.club_id = _club) DESC, COALESCE(c.name, ''), m.ladder_position NULLS LAST, m.name
  LIMIT _lim;
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_invite_directory(uuid, uuid, text, text, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_invite_directory(uuid, uuid, text, text, integer, uuid[]) TO authenticated;