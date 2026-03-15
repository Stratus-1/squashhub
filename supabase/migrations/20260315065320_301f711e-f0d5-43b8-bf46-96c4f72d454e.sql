-- Drop the unique constraint (not index) on (club_id, email)
ALTER TABLE public.club_members DROP CONSTRAINT IF EXISTS club_members_club_id_email_key;

-- Replace with a partial unique index: same email + same id_number in same club is not allowed
CREATE UNIQUE INDEX uq_club_members_email_id_number
ON public.club_members (club_id, email, id_number)
WHERE email IS NOT NULL AND email <> '' AND id_number IS NOT NULL AND id_number <> '';