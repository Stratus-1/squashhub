ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS invite_extra_details text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;