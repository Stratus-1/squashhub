CREATE TABLE public.tournament_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  club_id uuid NOT NULL,
  version int NOT NULL,
  stage_plans jsonb NOT NULL DEFAULT '{}'::jsonb,
  starting_default jsonb,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  UNIQUE (tournament_id, version)
);
COMMENT ON TABLE public.tournament_plan_versions IS 'Saved Planned Format stage plans (versioned). Saving never changes fixtures; applied_at is set only by a separately approved apply.';
GRANT SELECT, INSERT ON public.tournament_plan_versions TO authenticated;
GRANT ALL ON public.tournament_plan_versions TO service_role;
ALTER TABLE public.tournament_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tournament admins read plan versions" ON public.tournament_plan_versions FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'champs'));

-- Save a new version: club derived from the tournament (never trusted from the client), stale saves rejected.
CREATE OR REPLACE FUNCTION public.save_tournament_plan_version(_tournament_id uuid, _expected_version int, _stage_plans jsonb, _starting_default jsonb, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_club uuid; v_cur int;
BEGIN
  SELECT club_id INTO v_club FROM public.tournaments WHERE id = _tournament_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), v_club, 'champs') THEN
    RAISE EXCEPTION 'You do not have permission to change this tournament plan';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('plan:' || _tournament_id::text));
  SELECT COALESCE(max(version), 0) INTO v_cur FROM public.tournament_plan_versions WHERE tournament_id = _tournament_id;
  IF COALESCE(_expected_version, 0) <> v_cur THEN
    RAISE EXCEPTION 'Someone else saved a newer plan (version %). Reload before saving.', v_cur;
  END IF;
  INSERT INTO public.tournament_plan_versions (tournament_id, club_id, version, stage_plans, starting_default, note, created_by)
  VALUES (_tournament_id, v_club, v_cur + 1, COALESCE(_stage_plans, '{}'::jsonb), _starting_default, NULLIF(left(btrim(COALESCE(_note,'')),200),''), auth.uid());
  RETURN jsonb_build_object('version', v_cur + 1);
END; $$;
REVOKE ALL ON FUNCTION public.save_tournament_plan_version(uuid, int, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tournament_plan_version(uuid, int, jsonb, jsonb, text) TO authenticated;