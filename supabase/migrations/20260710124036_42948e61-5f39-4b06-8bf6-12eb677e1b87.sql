CREATE TABLE public.stitch_onboarding_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL UNIQUE REFERENCES public.clubs(id) ON DELETE CASCADE,
  contact_name TEXT,
  contact_email TEXT,
  contact_cell TEXT,
  club_url TEXT,
  board_members JSONB NOT NULL DEFAULT '[]'::jsonb,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stitch_onboarding_drafts TO authenticated;
GRANT ALL ON public.stitch_onboarding_drafts TO service_role;

ALTER TABLE public.stitch_onboarding_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins manage stitch onboarding drafts"
ON public.stitch_onboarding_drafts
FOR ALL
TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE TRIGGER update_stitch_onboarding_drafts_updated_at
BEFORE UPDATE ON public.stitch_onboarding_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();