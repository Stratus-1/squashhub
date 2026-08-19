CREATE TABLE public.champ_marker_locks (
  match_id UUID NOT NULL PRIMARY KEY REFERENCES public.club_champs_matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL DEFAULT 'Marker',
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  takeover_requested_by UUID,
  takeover_requested_name TEXT,
  takeover_requested_at TIMESTAMPTZ,
  takeover_declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.champ_marker_locks TO authenticated;
GRANT ALL ON public.champ_marker_locks TO service_role;

ALTER TABLE public.champ_marker_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view marker locks"
  ON public.champ_marker_locks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can claim a marker lock"
  ON public.champ_marker_locks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Marker or requester can update lock"
  ON public.champ_marker_locks FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (user_id = auth.uid() OR takeover_requested_by = auth.uid());

CREATE POLICY "Marker can release own lock"
  ON public.champ_marker_locks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.champ_marker_locks;