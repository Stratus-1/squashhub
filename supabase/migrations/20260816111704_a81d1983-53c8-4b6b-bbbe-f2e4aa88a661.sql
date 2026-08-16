ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS draw_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draw_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS draw_locked_by uuid,
  ADD COLUMN IF NOT EXISTS draw_version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.tournament_draw_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  version integer NOT NULL,
  note text,
  snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, version)
);

GRANT SELECT, INSERT ON public.tournament_draw_versions TO authenticated;
GRANT ALL ON public.tournament_draw_versions TO service_role;
ALTER TABLE public.tournament_draw_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tournament managers view draw versions"
  ON public.tournament_draw_versions FOR SELECT TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id));

CREATE POLICY "Tournament managers create draw versions"
  ON public.tournament_draw_versions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id) AND created_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.match_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id uuid NOT NULL,
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  reason text NOT NULL,
  proposed_score text,
  proposed_game_scores text,
  proposed_winner_member_id uuid,
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.match_correction_requests TO authenticated;
GRANT ALL ON public.match_correction_requests TO service_role;
ALTER TABLE public.match_correction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or managed correction requests"
  ON public.match_correction_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.can_manage_tournament(auth.uid(), tournament_id));

CREATE POLICY "Create correction requests"
  ON public.match_correction_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND public.can_view_tournament(auth.uid(), tournament_id));

CREATE POLICY "Managers review correction requests"
  ON public.match_correction_requests FOR UPDATE TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));

CREATE INDEX IF NOT EXISTS idx_mcr_tournament ON public.match_correction_requests(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_tdv_tournament ON public.tournament_draw_versions(tournament_id, version DESC);