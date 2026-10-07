DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('apply_ladder_adjustments','approve_ladder_move_pending','reject_ladder_move_pending','seed_ranking_points_from_ladder','admin_set_cross_gender_ladder','admin_reorder_ladder')
  LOOP
    def := pg_get_functiondef(r.oid);
    def := regexp_replace(def, 'is_club_admin\(\s*auth\.uid\(\)\s*,\s*([A-Za-z_\.]+)\s*\)', 'is_club_admin_or_permitted(auth.uid(), \1, ''ladder'')', 'g');
    EXECUTE def;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Club admins manage ladder config" ON public.ladder_configs;
CREATE POLICY "Club admins manage ladder config" ON public.ladder_configs FOR ALL TO authenticated
USING (is_club_admin_or_permitted(auth.uid(), club_id, 'ladder') OR is_platform_admin(auth.uid()))
WITH CHECK (is_club_admin_or_permitted(auth.uid(), club_id, 'ladder') OR is_platform_admin(auth.uid()));