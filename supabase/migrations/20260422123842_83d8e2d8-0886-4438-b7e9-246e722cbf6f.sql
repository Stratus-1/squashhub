-- Live marker TV pairing sessions
CREATE TABLE public.live_marker_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_code text NOT NULL UNIQUE,
  marker_user_id uuid,
  club_id uuid,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  paired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '4 hours')
);

CREATE INDEX idx_live_marker_sessions_code ON public.live_marker_sessions(pair_code);
CREATE INDEX idx_live_marker_sessions_expires ON public.live_marker_sessions(expires_at);

ALTER TABLE public.live_marker_sessions ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated TV browsers) can read a session by its code
CREATE POLICY "Anyone can view live marker sessions"
ON public.live_marker_sessions
FOR SELECT
TO anon, authenticated
USING (expires_at > now());

-- Authenticated users can create sessions (the marker)
CREATE POLICY "Authenticated users can create marker sessions"
ON public.live_marker_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = marker_user_id);

-- Marker owner can update their own session state
CREATE POLICY "Marker owner can update session"
ON public.live_marker_sessions
FOR UPDATE
TO authenticated
USING (auth.uid() = marker_user_id)
WITH CHECK (auth.uid() = marker_user_id);

-- Marker owner can delete (end cast) their session
CREATE POLICY "Marker owner can delete session"
ON public.live_marker_sessions
FOR DELETE
TO authenticated
USING (auth.uid() = marker_user_id);

-- Auto-update updated_at
CREATE TRIGGER update_live_marker_sessions_updated_at
BEFORE UPDATE ON public.live_marker_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER TABLE public.live_marker_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_marker_sessions;