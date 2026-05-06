-- 1. Pending captain claim flag
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS pending_captain_claim boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_club_members_pending_captain_claim
  ON public.club_members(club_id) WHERE pending_captain_claim = true;

-- 2. Public lookup by NSA number (strict match)
CREATE OR REPLACE FUNCTION public.lookup_league_player_by_nsa(
  _nsa_number text,
  _club_subdomain text DEFAULT NULL
)
RETURNS TABLE(
  member_id uuid,
  masked_name text,
  full_name text,
  gender text,
  club_id uuid,
  club_name text,
  club_subdomain text,
  league_name text,
  already_claimed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hit AS (
    SELECT
      cm.id            AS member_id,
      cm.name          AS full_name,
      cm.gender        AS gender,
      cm.club_id       AS club_id,
      cm.user_id       AS user_id,
      c.name           AS club_name,
      c.subdomain      AS club_subdomain
    FROM public.member_association_affiliations maa
    JOIN public.club_members cm ON cm.id = maa.club_member_id
    JOIN public.clubs c ON c.id = cm.club_id
    WHERE maa.active = true
      AND maa.league_association_number = trim(_nsa_number)
      AND (_club_subdomain IS NULL OR lower(c.subdomain) = lower(_club_subdomain))
    LIMIT 1
  ),
  league AS (
    SELECT mlr.club_member_id, l.name AS league_name
    FROM public.member_league_registrations mlr
    JOIN public.leagues l ON l.id = mlr.league_id
    WHERE mlr.club_member_id = (SELECT member_id FROM hit)
    ORDER BY l.created_at DESC
    LIMIT 1
  )
  SELECT
    h.member_id,
    -- Masked: "John S." style
    CASE
      WHEN h.full_name IS NULL OR h.full_name = '' THEN '—'
      ELSE split_part(h.full_name, ' ', 1) || ' ' ||
           left(NULLIF(substring(h.full_name from position(' ' in h.full_name) + 1), ''), 1) || '.'
    END AS masked_name,
    h.full_name,
    h.gender,
    h.club_id,
    h.club_name,
    h.club_subdomain,
    COALESCE((SELECT league_name FROM league), '—') AS league_name,
    (h.user_id IS NOT NULL) AS already_claimed
  FROM hit h
$$;

GRANT EXECUTE ON FUNCTION public.lookup_league_player_by_nsa(text, text) TO anon, authenticated;

-- 3. Public name search for type-ahead
CREATE OR REPLACE FUNCTION public.search_league_players_by_name(
  _query text,
  _club_subdomain text DEFAULT NULL
)
RETURNS TABLE(
  member_id uuid,
  masked_name text,
  club_name text,
  club_subdomain text,
  nsa_number text,
  already_claimed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cm.id AS member_id,
    CASE
      WHEN cm.name IS NULL OR cm.name = '' THEN '—'
      ELSE split_part(cm.name, ' ', 1) || ' ' ||
           left(NULLIF(substring(cm.name from position(' ' in cm.name) + 1), ''), 1) || '.'
    END AS masked_name,
    c.name AS club_name,
    c.subdomain AS club_subdomain,
    maa.league_association_number AS nsa_number,
    (cm.user_id IS NOT NULL) AS already_claimed
  FROM public.club_members cm
  JOIN public.clubs c ON c.id = cm.club_id
  JOIN public.member_association_affiliations maa ON maa.club_member_id = cm.id AND maa.active = true
  WHERE cm.is_league_only_membership = true
    AND length(trim(_query)) >= 2
    AND cm.name ILIKE '%' || trim(_query) || '%'
    AND (_club_subdomain IS NULL OR lower(c.subdomain) = lower(_club_subdomain))
  ORDER BY
    -- prioritise unclaimed first, then exact prefix matches
    (cm.user_id IS NOT NULL),
    CASE WHEN cm.name ILIKE trim(_query) || '%' THEN 0 ELSE 1 END,
    cm.name
  LIMIT 12
$$;

GRANT EXECUTE ON FUNCTION public.search_league_players_by_name(text, text) TO anon, authenticated;