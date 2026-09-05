CREATE POLICY "Club members can score undecided champs matches"
ON public.club_champs_matches
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments c
    WHERE c.id = club_champs_matches.champ_id
      AND public.is_club_member(auth.uid(), c.club_id)
  )
  AND club_champs_matches.winner_member_id IS NULL
  AND COALESCE(lower(club_champs_matches.status), '') NOT IN ('completed','forfeited','walkover','cancelled')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tournaments c
    WHERE c.id = club_champs_matches.champ_id
      AND public.is_club_member(auth.uid(), c.club_id)
  )
);

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS block_back_to_back_bookings boolean NOT NULL DEFAULT false;