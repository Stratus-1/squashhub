ALTER TABLE public.agm_ballots DROP CONSTRAINT IF EXISTS agm_ballots_status_check;
ALTER TABLE public.agm_ballots ADD CONSTRAINT agm_ballots_status_check CHECK (status = ANY (ARRAY['draft'::text, 'open'::text, 'completed'::text]));
ALTER TABLE public.agm_ballots ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.agm_ballots ADD COLUMN IF NOT EXISTS completion_note text;