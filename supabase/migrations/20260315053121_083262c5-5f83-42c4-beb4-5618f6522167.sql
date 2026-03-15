
-- Add unique constraint for member number within a club
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_members_club_member_number
ON public.club_members (club_id, club_member_number)
WHERE club_member_number IS NOT NULL AND club_member_number <> '';

-- Add unique constraint for ID number within a club
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_members_id_number
ON public.club_members (club_id, id_number)
WHERE id_number IS NOT NULL AND id_number <> '';
