-- ranking_points_ledger
DROP POLICY IF EXISTS "Club admins manage ledger" ON public.ranking_points_ledger;
DROP POLICY IF EXISTS "Members view own club ledger" ON public.ranking_points_ledger;

CREATE POLICY "Admins manage ranking ledger"
ON public.ranking_points_ledger FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Members view own club ledger"
ON public.ranking_points_ledger FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));

-- ranking_points_pending
DROP POLICY IF EXISTS "Club admins manage pending" ON public.ranking_points_pending;
DROP POLICY IF EXISTS "Members view own club pending" ON public.ranking_points_pending;

CREATE POLICY "Admins manage ranking pending"
ON public.ranking_points_pending FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Members view own club pending"
ON public.ranking_points_pending FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));

-- club_ranking_snapshots / entries
DROP POLICY IF EXISTS "Club members can view ranking snapshots" ON public.club_ranking_snapshots;
CREATE POLICY "Club members can view ranking snapshots"
ON public.club_ranking_snapshots FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Club members can view ranking snapshot entries" ON public.club_ranking_snapshot_entries;
CREATE POLICY "Club members can view ranking snapshot entries"
ON public.club_ranking_snapshot_entries FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));

-- club_ranking_rule_versions
DROP POLICY IF EXISTS "Club admins can add ranking rule versions" ON public.club_ranking_rule_versions;
DROP POLICY IF EXISTS "Club members can view ranking rule versions" ON public.club_ranking_rule_versions;

CREATE POLICY "Admins add ranking rule versions"
ON public.club_ranking_rule_versions FOR INSERT TO authenticated
WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Club members view ranking rule versions"
ON public.club_ranking_rule_versions FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));

-- ladder_configs: allow platform admins too
DROP POLICY IF EXISTS "Club admins manage ladder config" ON public.ladder_configs;
CREATE POLICY "Club admins manage ladder config"
ON public.ladder_configs FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));