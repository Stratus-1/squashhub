
CREATE TABLE public.league_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  association_id uuid NOT NULL REFERENCES public.league_associations(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  name text NOT NULL,
  round_date date NOT NULL,
  venue_name text NOT NULL DEFAULT '',
  court_ids integer[] NOT NULL DEFAULT '{}',
  start_time time NOT NULL DEFAULT '18:00',
  end_time time NOT NULL DEFAULT '22:00',
  slot_minutes integer NOT NULL DEFAULT 45,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (association_id, round_number)
);

CREATE INDEX idx_league_rounds_club ON public.league_rounds(club_id);
CREATE INDEX idx_league_rounds_assoc ON public.league_rounds(association_id);
CREATE INDEX idx_league_rounds_date ON public.league_rounds(round_date);

ALTER TABLE public.league_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their club rounds"
  ON public.league_rounds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.user_id = auth.uid() AND cm.club_id = league_rounds.club_id));

CREATE POLICY "Permitted members manage rounds"
  ON public.league_rounds FOR ALL TO authenticated
  USING (is_club_admin_or_permitted(auth.uid(), club_id, 'leagues'))
  WITH CHECK (is_club_admin_or_permitted(auth.uid(), club_id, 'leagues'));

CREATE TRIGGER league_rounds_updated_at
  BEFORE UPDATE ON public.league_rounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.platform_league_fixtures
  ADD COLUMN round_id uuid REFERENCES public.league_rounds(id) ON DELETE SET NULL,
  ADD COLUMN court_id integer REFERENCES public.courts(id) ON DELETE SET NULL,
  ADD COLUMN start_time time,
  ADD COLUMN booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE INDEX idx_fixtures_round ON public.platform_league_fixtures(round_id) WHERE round_id IS NOT NULL;
CREATE INDEX idx_fixtures_court ON public.platform_league_fixtures(court_id) WHERE court_id IS NOT NULL;

CREATE POLICY "Club admins manage round fixtures"
  ON public.platform_league_fixtures FOR ALL TO authenticated
  USING (
    round_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.league_rounds lr
      WHERE lr.id = platform_league_fixtures.round_id
        AND is_club_admin_or_permitted(auth.uid(), lr.club_id, 'leagues')
    )
  )
  WITH CHECK (
    round_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.league_rounds lr
      WHERE lr.id = platform_league_fixtures.round_id
        AND is_club_admin_or_permitted(auth.uid(), lr.club_id, 'leagues')
    )
  );
