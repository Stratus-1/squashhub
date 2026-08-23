-- ---------------------------------------------------------------------------
-- 1. Shared scope resolver: which clubs' players may enter, for a given scope.
--    Extracted verbatim from tournament_eligible_club_ids so the tournament
--    path and the pre-save (draft tournament) path can never diverge.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scope_eligible_club_ids(
  _club_id uuid,
  _owner_org_id uuid,
  _scope text
)
RETURNS TABLE(club_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := _owner_org_id;
  _assoc uuid;
  _root uuid;
BEGIN
  _scope := COALESCE(_scope, 'club');

  IF _owner IS NULL AND _club_id IS NOT NULL THEN
    SELECT o.id INTO _owner FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id = _club_id LIMIT 1;
  END IF;

  IF _scope = 'club' THEN
    RETURN QUERY
      SELECT c.id FROM public.clubs c
      WHERE c.id = _club_id
         OR c.id = (SELECT o.club_id FROM public.organisations o WHERE o.id = _owner);
    RETURN;
  END IF;

  IF _scope = 'association' THEN
    SELECT CASE
      WHEN (SELECT o.kind FROM public.organisations o WHERE o.id = _owner) = 'association'
        THEN _owner
      ELSE public.org_owning_association(_owner)
    END INTO _assoc;

    IF _assoc IS NULL THEN
      RETURN QUERY SELECT c.id FROM public.clubs c WHERE c.id = _club_id;
      RETURN;
    END IF;

    RETURN QUERY
      SELECT DISTINCT o.club_id
      FROM public.org_descendants(_assoc) d
      JOIN public.organisations o ON o.id = d.org_id
      WHERE o.kind = 'club' AND o.club_id IS NOT NULL
      UNION
      SELECT c.id FROM public.clubs c WHERE c.id = _club_id;
    RETURN;
  END IF;

  -- open / federation: everyone under the federation, including clubs that are
  -- not affiliated to any association.
  _root := public.org_federation_root(_owner);

  RETURN QUERY
    SELECT DISTINCT o.club_id
    FROM public.org_descendants(_root) d
    JOIN public.organisations o ON o.id = d.org_id
    WHERE o.kind = 'club' AND o.club_id IS NOT NULL
    UNION
    SELECT o.club_id
    FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.organisation_relationships r
        WHERE r.child_org_id = o.id
          AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
      )
    UNION
    SELECT c.id FROM public.clubs c
    WHERE NOT EXISTS (SELECT 1 FROM public.organisations o2 WHERE o2.club_id = c.id);
END;
$$;

REVOKE ALL ON FUNCTION public.scope_eligible_club_ids(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scope_eligible_club_ids(uuid, uuid, text) TO authenticated, service_role;

-- Existing eligibility function now delegates to the shared helper.
CREATE OR REPLACE FUNCTION public.tournament_eligible_club_ids(_tournament_id uuid)
RETURNS TABLE(club_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scope text;
  _owner uuid;
  _club uuid;
BEGIN
  SELECT t.club_id, t.owner_org_id INTO _club, _owner
  FROM public.tournaments t WHERE t.id = _tournament_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT g.eligibility_scope INTO _scope
  FROM public.tournament_governance g WHERE g.tournament_id = _tournament_id;

  RETURN QUERY SELECT s.club_id
  FROM public.scope_eligible_club_ids(_club, _owner, COALESCE(_scope, 'club')) s;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Privacy-safe player directory for the invitation picker.
--    SAFE PROJECTION ONLY. Never add email, phone, address, id_number,
--    date of birth, emergency contacts, billing data or auth identifiers to
--    this result — the organiser must never receive a player's private
--    contact details just because they can invite that player. The invite
--    delivery itself reads the contact channel server-side.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tournament_invite_directory(
  p_tournament_id uuid DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 200
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
  invite_status text
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
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_tournament_id IS NOT NULL THEN
    SELECT t.club_id, t.owner_org_id INTO _club, _owner
    FROM public.tournaments t WHERE t.id = p_tournament_id;
    IF _club IS NULL AND _owner IS NULL THEN
      RAISE EXCEPTION 'Tournament not found';
    END IF;

    -- Organiser rights on THIS tournament (club champs admins, tournament
    -- directors, association/federation officials, platform admins).
    IF NOT public.can_manage_tournament(_uid, p_tournament_id) THEN
      RAISE EXCEPTION 'Not authorised to browse the player directory for this tournament';
    END IF;

    SELECT g.eligibility_scope INTO _scope
    FROM public.tournament_governance g WHERE g.tournament_id = p_tournament_id;
  ELSE
    -- Draft tournament (not saved yet): organiser must hold champs rights on
    -- the club they are creating the tournament for.
    IF _club IS NULL THEN
      RAISE EXCEPTION 'A club or tournament is required';
    END IF;
    IF NOT (public.is_platform_admin(_uid)
            OR public.is_club_admin_or_permitted(_uid, _club, 'champs')) THEN
      RAISE EXCEPTION 'Not authorised to browse the player directory for this club';
    END IF;
  END IF;

  _scope := COALESCE(_scope, 'club');

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
    r.status::text
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
    AND (_q IS NULL OR m.name ILIKE '%' || _q || '%' OR COALESCE(c.name, '') ILIKE '%' || _q || '%')
  ORDER BY (m.club_id = _club) DESC, COALESCE(c.name, ''), m.ladder_position NULLS LAST, m.name
  LIMIT _lim;
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_invite_directory(uuid, uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_invite_directory(uuid, uuid, text, text, integer) TO authenticated;

COMMENT ON FUNCTION public.tournament_invite_directory(uuid, uuid, text, text, integer) IS
  'Privacy-safe cross-club player directory for tournament invitations. Returns ONLY identity/sporting fields (name, club, gender, ladder position, ranking points). Never return email, phone, address, id_number, date of birth or billing data from this function.';