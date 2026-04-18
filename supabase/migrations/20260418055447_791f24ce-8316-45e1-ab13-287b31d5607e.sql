CREATE TABLE IF NOT EXISTS public.league_week_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, club_member_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_lwu_club_week ON public.league_week_unavailability(club_id, week_start_date);

ALTER TABLE public.league_week_unavailability ENABLE ROW LEVEL SECURITY;

-- Club members can view week unavailability
CREATE POLICY "club members view week unavailability"
ON public.league_week_unavailability
FOR SELECT
TO authenticated
USING (is_club_member(auth.uid(), club_id));

-- Club admins or any league captain in the club can insert
CREATE POLICY "captains/admins add week unavailability"
ON public.league_week_unavailability
FOR INSERT
TO authenticated
WITH CHECK (
  is_club_admin(auth.uid(), club_id)
  OR EXISTS (
    SELECT 1 FROM public.leagues l
    JOIN public.club_members cm ON cm.id = l.captain_member_id
    WHERE l.club_id = league_week_unavailability.club_id
      AND cm.user_id = auth.uid()
  )
);

-- Club admins or any league captain in the club can delete
CREATE POLICY "captains/admins delete week unavailability"
ON public.league_week_unavailability
FOR DELETE
TO authenticated
USING (
  is_club_admin(auth.uid(), club_id)
  OR EXISTS (
    SELECT 1 FROM public.leagues l
    JOIN public.club_members cm ON cm.id = l.captain_member_id
    WHERE l.club_id = league_week_unavailability.club_id
      AND cm.user_id = auth.uid()
  )
);