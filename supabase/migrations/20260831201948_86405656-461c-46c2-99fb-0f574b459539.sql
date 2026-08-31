ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_invite_audience_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_invite_audience_check
  CHECK (invite_audience = ANY (ARRAY['all_club'::text, 'leagues'::text, 'individuals'::text, 'clubs'::text]));