
-- Drop auth.users FK constraints since we now use club_member_id as primary identity
ALTER TABLE public.challenges DROP CONSTRAINT challenges_opponent_id_fkey;
ALTER TABLE public.challenges DROP CONSTRAINT challenges_challenger_id_fkey;
