
-- Club Champs tournament table
CREATE TABLE public.club_champs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  gender text NOT NULL,
  status text NOT NULL DEFAULT 'planning',
  num_groups integer NOT NULL DEFAULT 2,
  start_date date NOT NULL,
  end_date date NOT NULL,
  play_days integer[] NOT NULL DEFAULT '{}',
  start_time time NOT NULL DEFAULT '18:00',
  end_time time NOT NULL DEFAULT '20:00',
  match_duration_minutes integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_champs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view champs" ON public.club_champs
  FOR SELECT TO authenticated USING (is_club_member(auth.uid(), club_id));
CREATE POLICY "Club admins can insert champs" ON public.club_champs
  FOR INSERT TO authenticated WITH CHECK (is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins can update champs" ON public.club_champs
  FOR UPDATE TO authenticated USING (is_club_admin(auth.uid(), club_id));
CREATE POLICY "Club admins can delete champs" ON public.club_champs
  FOR DELETE TO authenticated USING (is_club_admin(auth.uid(), club_id));

-- Entries (players in a champ)
CREATE TABLE public.club_champs_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champ_id uuid NOT NULL REFERENCES public.club_champs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  group_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(champ_id, club_member_id)
);

ALTER TABLE public.club_champs_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view entries" ON public.club_champs_entries
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_member(auth.uid(), c.club_id)
  ));
CREATE POLICY "Club admins can insert entries" ON public.club_champs_entries
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_admin(auth.uid(), c.club_id)
  ));
CREATE POLICY "Club admins can update entries" ON public.club_champs_entries
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_admin(auth.uid(), c.club_id)
  ));
CREATE POLICY "Club admins can delete entries" ON public.club_champs_entries
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_admin(auth.uid(), c.club_id)
  ));

-- Matches within a champ
CREATE TABLE public.club_champs_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champ_id uuid NOT NULL REFERENCES public.club_champs(id) ON DELETE CASCADE,
  group_number integer NOT NULL,
  round_number integer NOT NULL DEFAULT 1,
  player_a_member_id uuid NOT NULL REFERENCES public.club_members(id),
  player_b_member_id uuid NOT NULL REFERENCES public.club_members(id),
  scheduled_date date,
  scheduled_time time,
  court_id integer REFERENCES public.courts(id),
  status text NOT NULL DEFAULT 'scheduled',
  winner_member_id uuid REFERENCES public.club_members(id),
  score text,
  game_scores text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_champs_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view champs matches" ON public.club_champs_matches
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_member(auth.uid(), c.club_id)
  ));
CREATE POLICY "Club admins can insert champs matches" ON public.club_champs_matches
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_admin(auth.uid(), c.club_id)
  ));
CREATE POLICY "Club admins can update champs matches" ON public.club_champs_matches
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_admin(auth.uid(), c.club_id)
  ));
CREATE POLICY "Club admins can delete champs matches" ON public.club_champs_matches
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.club_champs c WHERE c.id = champ_id AND is_club_admin(auth.uid(), c.club_id)
  ));

CREATE TRIGGER update_club_champs_updated_at BEFORE UPDATE ON public.club_champs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_club_champs_matches_updated_at BEFORE UPDATE ON public.club_champs_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
