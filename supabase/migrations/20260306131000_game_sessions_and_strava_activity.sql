-- Per-game tracking sessions (start/stop inside the app)
-- Optional: attach a Strava activity to the session after syncing.

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  duration_s integer,
  opponent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opponent_name text,
  notes text,
  strava_activity_id bigint,
  strava_name text,
  strava_sport_type text,
  strava_start_date timestamp with time zone,
  strava_distance_m bigint,
  strava_moving_time_s integer,
  strava_elevation_m integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Private by default: only the owner can see/update their sessions.
DROP POLICY IF EXISTS "Game sessions viewable by owner" ON public.game_sessions;
CREATE POLICY "Game sessions viewable by owner"
  ON public.game_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own game sessions" ON public.game_sessions;
CREATE POLICY "Users can create own game sessions"
  ON public.game_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own game sessions" ON public.game_sessions;
CREATE POLICY "Users can update own game sessions"
  ON public.game_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_game_sessions_updated_at ON public.game_sessions;
CREATE TRIGGER update_game_sessions_updated_at
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS game_sessions_user_started_at_idx
  ON public.game_sessions (user_id, started_at DESC);

