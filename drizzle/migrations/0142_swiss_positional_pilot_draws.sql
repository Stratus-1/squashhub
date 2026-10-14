ALTER TABLE public.club_beta_features DROP CONSTRAINT IF EXISTS club_beta_features_feature_check;
ALTER TABLE public.club_beta_features ADD CONSTRAINT club_beta_features_feature_check CHECK (feature = ANY (ARRAY['tournament_beta','ai_actions','tournament_viewer_shell','tournament_swiss_progression_view','tournament_pool_matrix_view','tournament_bracket_view','tournament_schedule_board','tournament_swiss_category_rounds','tournament_swiss_positional_draw']::text[]));

CREATE TABLE public.swiss_positional_pilot_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  pilot_label text NOT NULL,
  category_key text NOT NULL,
  category_label text NOT NULL,
  rounds integer NOT NULL CHECK (rounds >= 1),
  entrants jsonb NOT NULL,
  fixtures jsonb NOT NULL,
  byes jsonb NOT NULL DEFAULT '[]'::jsonb,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, pilot_label, category_key)
);
COMMENT ON TABLE public.swiss_positional_pilot_draws IS 'Riverside pilot: fixed-position Swiss full draws (generated once). Separate from club_champs_matches; never feeds live draws, rankings or bookings.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.swiss_positional_pilot_draws TO authenticated;
GRANT ALL ON public.swiss_positional_pilot_draws TO service_role;
ALTER TABLE public.swiss_positional_pilot_draws ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.swiss_pilot_allowed(_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.club_beta_features WHERE club_id = _club_id AND feature = 'tournament_swiss_positional_draw')
     AND (public.has_role(auth.uid(), 'admin') OR public.is_club_admin(auth.uid(), _club_id));
$$;

CREATE POLICY "pilot admins read" ON public.swiss_positional_pilot_draws FOR SELECT TO authenticated USING (public.swiss_pilot_allowed(club_id));
CREATE POLICY "pilot admins insert" ON public.swiss_positional_pilot_draws FOR INSERT TO authenticated WITH CHECK (public.swiss_pilot_allowed(club_id));
CREATE POLICY "pilot admins update" ON public.swiss_positional_pilot_draws FOR UPDATE TO authenticated USING (public.swiss_pilot_allowed(club_id)) WITH CHECK (public.swiss_pilot_allowed(club_id));
CREATE POLICY "pilot admins delete" ON public.swiss_positional_pilot_draws FOR DELETE TO authenticated USING (public.swiss_pilot_allowed(club_id));

-- Generated once: fixtures, entrants, rounds and byes are frozen after insert.
CREATE OR REPLACE FUNCTION public.swiss_pilot_freeze_draw()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.fixtures IS DISTINCT FROM OLD.fixtures OR NEW.entrants IS DISTINCT FROM OLD.entrants
     OR NEW.rounds IS DISTINCT FROM OLD.rounds OR NEW.byes IS DISTINCT FROM OLD.byes
     OR NEW.club_id IS DISTINCT FROM OLD.club_id OR NEW.category_key IS DISTINCT FROM OLD.category_key THEN
    RAISE EXCEPTION 'Positional draw is generated once and cannot be re-drawn';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER swiss_pilot_freeze BEFORE UPDATE ON public.swiss_positional_pilot_draws FOR EACH ROW EXECUTE FUNCTION public.swiss_pilot_freeze_draw();

-- Atomic, idempotent result write: never silently overwrites a different saved winner.
CREATE OR REPLACE FUNCTION public.swiss_pilot_record_result(_draw_id uuid, _key text, _winner text, _score text, _replace boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE cur jsonb;
BEGIN
  IF _winner NOT IN ('a','b') THEN RAISE EXCEPTION 'winner must be a or b'; END IF;
  SELECT results INTO cur FROM public.swiss_positional_pilot_draws WHERE id = _draw_id FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'Draw not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.swiss_positional_pilot_draws d, jsonb_array_elements(d.fixtures) f WHERE d.id = _draw_id AND f->>'key' = _key) THEN
    RAISE EXCEPTION 'Unknown fixture';
  END IF;
  IF cur ? _key AND cur->_key->>'winner' <> _winner AND NOT _replace THEN
    RAISE EXCEPTION 'A different result is already saved for this match';
  END IF;
  UPDATE public.swiss_positional_pilot_draws
     SET results = cur || jsonb_build_object(_key, jsonb_build_object('winner', _winner, 'score', _score))
   WHERE id = _draw_id
  RETURNING results INTO cur;
  RETURN cur;
END $$;
GRANT EXECUTE ON FUNCTION public.swiss_pilot_record_result(uuid, text, text, text, boolean) TO authenticated;