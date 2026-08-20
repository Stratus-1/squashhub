-- Fix cross-tenant write exposure on club_visitor_home_clubs.
-- The table was converted to a shared global lookup (club_id nullable). The
-- scoped policies from the original migration correctly restrict club-specific
-- rows to their own club admins, while the later global helper policies
-- omitted the club_id check and therefore allowed any club admin to write any
-- row. This migration drops the unscoped helpers and replaces the scoped
-- policies with versions that allow any club admin to manage the global rows
-- (club_id IS NULL) but still restrict club-scoped rows to their own admins.

DROP POLICY IF EXISTS "Club admins can insert home clubs" ON public.club_visitor_home_clubs;
DROP POLICY IF EXISTS "Club admins can update home clubs" ON public.club_visitor_home_clubs;
DROP POLICY IF EXISTS "Club admins can delete home clubs" ON public.club_visitor_home_clubs;

DROP POLICY IF EXISTS "Club admins can add home-club options" ON public.club_visitor_home_clubs;
CREATE POLICY "Club admins can add home-club options"
  ON public.club_visitor_home_clubs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_club_admin(auth.uid(), club_id)
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS "Club admins can edit home-club options" ON public.club_visitor_home_clubs;
CREATE POLICY "Club admins can edit home-club options"
  ON public.club_visitor_home_clubs FOR UPDATE
  TO authenticated
  USING (
    public.is_club_admin(auth.uid(), club_id)
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    ))
  );

DROP POLICY IF EXISTS "Club admins can remove home-club options" ON public.club_visitor_home_clubs;
CREATE POLICY "Club admins can remove home-club options"
  ON public.club_visitor_home_clubs FOR DELETE
  TO authenticated
  USING (
    public.is_club_admin(auth.uid(), club_id)
    OR (club_id IS NULL AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid() AND cm.role = 'admin'
    ))
  );
