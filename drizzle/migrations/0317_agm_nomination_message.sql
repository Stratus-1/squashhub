ALTER TABLE public.agm_ballots ADD COLUMN IF NOT EXISTS nomination_message text;
COMMENT ON COLUMN public.agm_ballots.nomination_message IS 'Editable draft text for the call-for-nominations email; placeholders {member name}, {meeting date}, {nominations close}.';
