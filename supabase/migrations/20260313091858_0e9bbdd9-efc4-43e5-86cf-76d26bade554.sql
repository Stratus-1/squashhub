
-- Table to track actual light usage for billing
CREATE TABLE public.light_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  court_id integer NOT NULL REFERENCES public.courts(id),
  user_id uuid NOT NULL,
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_minutes numeric,
  fee_charged numeric DEFAULT 0,
  fee_per_hour numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.light_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own light sessions
CREATE POLICY "Users can view own light sessions"
  ON public.light_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own active sessions (for terminate/transfer)
CREATE POLICY "Users can update own light sessions"
  ON public.light_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Service role inserts (from edge function) - no INSERT policy needed for users
-- Club admins can view all sessions for their club
CREATE POLICY "Club admins can view club light sessions"
  ON public.light_sessions FOR SELECT TO authenticated
  USING (is_club_admin(auth.uid(), club_id));

-- Store lights_requested on bookings to know if user wanted lights
ALTER TABLE public.bookings ADD COLUMN lights_requested boolean NOT NULL DEFAULT false;
