CREATE OR REPLACE FUNCTION public.validate_challenge_gender_group(_club_id uuid, _a text, _b text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT c.mixed_ladder_enabled FROM public.clubs c WHERE c.id = _club_id), false)
      OR _a IS NOT DISTINCT FROM _b
$$;