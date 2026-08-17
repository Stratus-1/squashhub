-- Fix critical RLS / view exposure findings blocking publish

-- === 1. Public club delegates view (security invoker) =====================
DROP VIEW IF EXISTS public.club_delegates_public;

CREATE VIEW public.club_delegates_public
WITH (security_invoker = true) AS
  SELECT cm.id, cm.club_id, COALESCE(p.name, cm.name, '') AS name
  FROM public.club_members cm
  LEFT JOIN public.profiles p ON p.id = cm.user_id
  WHERE EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = cm.club_id
      AND (c.chairman_member_id = cm.id OR c.secretary_member_id = cm.id OR c.club_captain_member_id = cm.id)
  );

GRANT SELECT ON public.club_delegates_public TO anon, authenticated;

-- Allow anon to read only the public delegate rows in club_members.
DROP POLICY IF EXISTS "Anon can view public club delegates" ON public.club_members;
CREATE POLICY "Anon can view public club delegates"
  ON public.club_members FOR SELECT
  TO anon
  USING (EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = club_members.club_id
      AND (c.chairman_member_id = club_members.id OR c.secretary_member_id = club_members.id OR c.club_captain_member_id = club_members.id)
  ));

-- === 2. league_associations scoped SELECT ==================================
DROP POLICY IF EXISTS "Authenticated users can view associations" ON public.league_associations;

CREATE POLICY "Club members and admins can view their associations"
  ON public.league_associations FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.is_club_member(auth.uid(), club_id)
  );

-- === 3. national_body_fees scoped SELECT ===================================
DROP POLICY IF EXISTS "Authenticated users can view national fees" ON public.national_body_fees;

CREATE POLICY "Club members and admins can view their national body fees"
  ON public.national_body_fees FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.is_club_member(auth.uid(), club_id)
  );

-- The existing "Public can view national fees flagged for landing" policy remains in place
-- so anonymous users can still read show_on_landing = true rows on the public club landing page.
