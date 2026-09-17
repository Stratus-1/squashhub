DROP POLICY IF EXISTS "Host club members view tournament registrations"
ON public.club_champs_registrations;

CREATE POLICY "Club members and entrants view tournament registrations"
ON public.club_champs_registrations
FOR SELECT
TO authenticated
USING (public.can_view_tournament(auth.uid(), champ_id));

DROP POLICY IF EXISTS "Host club members and entrants view entries"
ON public.club_champs_entries;

CREATE POLICY "Club members and entrants view tournament entries"
ON public.club_champs_entries
FOR SELECT
TO authenticated
USING (public.can_view_tournament(auth.uid(), champ_id));