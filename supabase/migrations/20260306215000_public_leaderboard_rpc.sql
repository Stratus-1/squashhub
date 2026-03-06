-- Public leaderboard (safe, no PII)
-- Exposes a limited projection of profiles for unauthenticated visitors.

CREATE OR REPLACE FUNCTION public.get_public_leaderboard(limit_count integer DEFAULT 10)
RETURNS TABLE (
  id uuid,
  name text,
  rank integer,
  matches_played integer,
  wins integer,
  losses integer,
  win_rate integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.rank,
    p.matches_played,
    p.wins,
    p.losses,
    CASE
      WHEN p.matches_played > 0 THEN round((p.wins::numeric / p.matches_played::numeric) * 100)::int
      ELSE 0
    END AS win_rate
  FROM public.profiles p
  WHERE p.rank IS NOT NULL
    AND p.rank BETWEEN 1 AND 20
  ORDER BY p.rank ASC
  LIMIT greatest(1, least(coalesce(limit_count, 10), 50));
$$;

GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(integer) TO authenticated;

