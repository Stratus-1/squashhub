
-- Convert club_visitor_home_clubs into a shared global lookup.
-- club_id NULL means "global entry visible to every club".

ALTER TABLE public.club_visitor_home_clubs
  ALTER COLUMN club_id DROP NOT NULL;

-- Deduplicate: promote every distinct name to a single global row,
-- then remove per-club duplicates.
INSERT INTO public.club_visitor_home_clubs (club_id, name)
SELECT NULL, name
FROM (SELECT DISTINCT name FROM public.club_visitor_home_clubs) d
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_visitor_home_clubs g
  WHERE g.club_id IS NULL AND lower(g.name) = lower(d.name)
);

DELETE FROM public.club_visitor_home_clubs
WHERE club_id IS NOT NULL;

-- Ensure Vaal Squash Club (Vaal Driehoek / Vanderbijlpark) is present.
INSERT INTO public.club_visitor_home_clubs (club_id, name)
SELECT NULL, 'Vaal Squash Club'
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_visitor_home_clubs
  WHERE club_id IS NULL AND lower(name) = lower('Vaal Squash Club')
);

-- Unique index on global names (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS club_visitor_home_clubs_global_name_uidx
  ON public.club_visitor_home_clubs (lower(name))
  WHERE club_id IS NULL;

-- RLS: allow any authenticated user to read global rows, and any club admin
-- to insert/update/delete global rows (shared master list).
DROP POLICY IF EXISTS "Anyone authenticated can read home clubs" ON public.club_visitor_home_clubs;
CREATE POLICY "Anyone authenticated can read home clubs"
  ON public.club_visitor_home_clubs
  FOR SELECT
  TO authenticated
  USING (club_id IS NULL OR true);

DROP POLICY IF EXISTS "Club admins can insert home clubs" ON public.club_visitor_home_clubs;
CREATE POLICY "Club admins can insert home clubs"
  ON public.club_visitor_home_clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Club admins can update home clubs" ON public.club_visitor_home_clubs;
CREATE POLICY "Club admins can update home clubs"
  ON public.club_visitor_home_clubs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Club admins can delete home clubs" ON public.club_visitor_home_clubs;
CREATE POLICY "Club admins can delete home clubs"
  ON public.club_visitor_home_clubs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  );
