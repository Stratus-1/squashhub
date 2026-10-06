DROP POLICY IF EXISTS "md device insert results" ON public.league_fixture_results;
CREATE POLICY "md device insert results" ON public.league_fixture_results FOR INSERT TO anon
WITH CHECK ((fixture_id = ANY ((SELECT public.md_hdr_writable_fixture_ids())::uuid[])) AND ((COALESCE(status,'draft') IN ('draft','setup')) OR ((status='submitted') AND (COALESCE(home_captain_signature,'') <> ALL (ARRAY['','ADMIN_OVERRIDE'])) AND (COALESCE(away_captain_signature,'') <> ALL (ARRAY['','ADMIN_OVERRIDE'])))));
DROP POLICY IF EXISTS "md device update results" ON public.league_fixture_results;
CREATE POLICY "md device update results" ON public.league_fixture_results FOR UPDATE TO anon
USING (fixture_id = ANY ((SELECT public.md_hdr_writable_fixture_ids())::uuid[]))
WITH CHECK ((fixture_id = ANY ((SELECT public.md_hdr_fixture_ids())::uuid[])) AND ((COALESCE(status,'draft') IN ('draft','setup')) OR ((status='submitted') AND (COALESCE(home_captain_signature,'') <> ALL (ARRAY['','ADMIN_OVERRIDE'])) AND (COALESCE(away_captain_signature,'') <> ALL (ARRAY['','ADMIN_OVERRIDE'])))));