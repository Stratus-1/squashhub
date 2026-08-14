ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.club_members.billing_exempt IS 'When true the member is not counted towards the club''s billable member count (e.g. placeholder league visitor slots).';

CREATE INDEX IF NOT EXISTS idx_club_members_billing_exempt
  ON public.club_members (club_id)
  WHERE billing_exempt = true;