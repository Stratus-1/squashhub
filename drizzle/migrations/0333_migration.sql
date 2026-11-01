DROP POLICY IF EXISTS "Club members and super admins can view registrations" ON public.member_league_registrations;
CREATE POLICY "Club members and super admins can view registrations" ON public.member_league_registrations
  FOR SELECT TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.id = member_league_registrations.club_member_id AND is_club_member((select auth.uid()), cm.club_id)));

DROP POLICY IF EXISTS "Opposing captains can view fixture registrations" ON public.member_league_registrations;
CREATE POLICY "Opposing captains can view fixture registrations" ON public.member_league_registrations
  FOR SELECT TO authenticated
  USING (viewer_is_opposing_captain_for_registration((select auth.uid()), league_id, club_member_id));

DROP POLICY IF EXISTS "View league rules" ON public.league_rules;
CREATE POLICY "View league rules" ON public.league_rules
  FOR SELECT TO authenticated
  USING ((association_id IS NOT NULL) OR ((club_id IS NOT NULL) AND EXISTS (
    SELECT 1 FROM club_members cm WHERE cm.club_id = league_rules.club_id AND cm.user_id = (select auth.uid())))
    OR has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Club members and tournament admins can view champs matches" ON public.club_champs_matches;
CREATE POLICY "Club members and tournament admins can view champs matches" ON public.club_champs_matches
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM tournaments c WHERE c.id = club_champs_matches.champ_id
    AND (is_club_member((select auth.uid()), c.club_id) OR is_club_admin_or_permitted((select auth.uid()), c.club_id, 'champs'::text))));

DROP POLICY IF EXISTS "Tournament officials can view champs matches" ON public.club_champs_matches;
CREATE POLICY "Tournament officials can view champs matches" ON public.club_champs_matches
  FOR SELECT TO authenticated
  USING (can_view_tournament((select auth.uid()), champ_id));