
-- Fix the one user-defined function missing search_path
ALTER FUNCTION public.next_league_week_start(date, integer) SET search_path = public;

-- Tighten the only "WITH CHECK (true)" write policy
DROP POLICY IF EXISTS "Anyone can register as a visitor" ON public.club_visitors;

CREATE POLICY "Anyone can register as a visitor"
ON public.club_visitors FOR INSERT
WITH CHECK (
  club_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = club_visitors.club_id)
);
