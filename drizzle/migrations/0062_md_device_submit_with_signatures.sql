DROP POLICY IF EXISTS "md device insert results" ON public.league_fixture_results;
DROP POLICY IF EXISTS "md device update results" ON public.league_fixture_results;
-- Device may save drafts, and submit only with BOTH captains' signatures (never admin override).
CREATE POLICY "md device insert results" ON public.league_fixture_results FOR INSERT TO anon
  WITH CHECK (fixture_id = ANY((SELECT public.md_hdr_writable_fixture_ids())::uuid[])
    AND (coalesce(status,'draft') = 'draft'
      OR (status = 'submitted' AND coalesce(home_captain_signature,'') NOT IN ('', 'ADMIN_OVERRIDE')
                               AND coalesce(away_captain_signature,'') NOT IN ('', 'ADMIN_OVERRIDE'))));
CREATE POLICY "md device update results" ON public.league_fixture_results FOR UPDATE TO anon
  USING (fixture_id = ANY((SELECT public.md_hdr_writable_fixture_ids())::uuid[]))
  WITH CHECK (fixture_id = ANY((SELECT public.md_hdr_fixture_ids())::uuid[])
    AND (coalesce(status,'draft') = 'draft'
      OR (status = 'submitted' AND coalesce(home_captain_signature,'') NOT IN ('', 'ADMIN_OVERRIDE')
                               AND coalesce(away_captain_signature,'') NOT IN ('', 'ADMIN_OVERRIDE'))));