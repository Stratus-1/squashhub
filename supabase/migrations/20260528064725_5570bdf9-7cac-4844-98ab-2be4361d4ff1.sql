ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS fill_up_leagues_enabled boolean NOT NULL DEFAULT true;

UPDATE public.league_rules
SET fill_up_leagues_enabled = false
WHERE association_id IN (
  '3b0ca049-ee95-4773-9a1c-d67ddf2e2d3a',
  'ee8a24da-2d24-411a-bb02-92bafa1d2820'
);

INSERT INTO public.league_rules (association_id, fill_up_leagues_enabled)
SELECT pla.id, false
FROM public.platform_league_associations pla
WHERE pla.id IN (
  '3b0ca049-ee95-4773-9a1c-d67ddf2e2d3a',
  'ee8a24da-2d24-411a-bb02-92bafa1d2820'
)
AND NOT EXISTS (SELECT 1 FROM public.league_rules lr WHERE lr.association_id = pla.id);