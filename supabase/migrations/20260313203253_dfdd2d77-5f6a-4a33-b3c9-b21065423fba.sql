
CREATE TABLE public.challenge_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL,
  proposed_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  court_id integer REFERENCES public.courts(id),
  booking_id uuid REFERENCES public.bookings(id),
  status text NOT NULL DEFAULT 'proposed',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.challenge_schedules ENABLE ROW LEVEL SECURITY;

-- Participants can view schedules for their challenges
CREATE POLICY "Participants can view challenge schedules"
  ON public.challenge_schedules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_schedules.challenge_id
        AND (c.challenger_id = auth.uid() OR c.opponent_id = auth.uid())
    )
  );

-- Participants can insert schedules
CREATE POLICY "Participants can propose schedules"
  ON public.challenge_schedules FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = proposed_by
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_schedules.challenge_id
        AND (c.challenger_id = auth.uid() OR c.opponent_id = auth.uid())
    )
  );

-- Participants can update schedules (accept/decline)
CREATE POLICY "Participants can update schedules"
  ON public.challenge_schedules FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_schedules.challenge_id
        AND (c.challenger_id = auth.uid() OR c.opponent_id = auth.uid())
    )
  );

-- Auto-update updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.challenge_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
