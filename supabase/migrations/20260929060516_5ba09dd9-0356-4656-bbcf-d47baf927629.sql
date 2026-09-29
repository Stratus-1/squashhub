CREATE TABLE public.team_league_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  teams jsonb NOT NULL DEFAULT '[]'::jsonb,
  weeks jsonb NOT NULL DEFAULT '[]'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'planning',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_league_events TO authenticated;
GRANT ALL ON public.team_league_events TO service_role;
ALTER TABLE public.team_league_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club members view team leagues" ON public.team_league_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.club_id = team_league_events.club_id AND cm.user_id = auth.uid()) OR public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins manage team leagues" ON public.team_league_events FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id)) WITH CHECK (public.is_club_admin(auth.uid(), club_id));
CREATE TRIGGER team_league_events_updated BEFORE UPDATE ON public.team_league_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();