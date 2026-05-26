-- Add per-association toggle: allow a member to be registered in multiple
-- teams within the same association (NSA = true, NIL = false default).
ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS allow_multi_team_registration boolean NOT NULL DEFAULT false;

-- Update the trigger to consult the rule. Look up the rule for the league's
-- association (preferring league-scoped row, falling back to association-scoped).
CREATE OR REPLACE FUNCTION public.enforce_one_team_per_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_assoc_id uuid;
  v_target_is_reserve boolean := false;
  v_allow_multi boolean := false;
  v_existing_count int;
  v_existing_team text;
BEGIN
  SELECT
    l.association_id,
    (COALESCE(NEW.is_reserve, false) OR l.name ~* 'reserves?')
  INTO v_assoc_id, v_target_is_reserve
  FROM public.leagues l
  WHERE l.id = NEW.league_id;

  IF v_assoc_id IS NULL OR v_target_is_reserve THEN
    RETURN NEW;
  END IF;

  -- Check the association's rule. Prefer the league-scoped rule row; fall back
  -- to the association-scoped rule row; default false (strict, like NIL).
  SELECT COALESCE(
    (SELECT allow_multi_team_registration FROM public.league_rules
       WHERE league_id = NEW.league_id LIMIT 1),
    (SELECT lr.allow_multi_team_registration
       FROM public.league_rules lr
       JOIN public.league_associations la ON la.id = v_assoc_id
       WHERE lr.association_id = la.platform_association_id
          OR lr.association_id = v_assoc_id
       LIMIT 1),
    false
  ) INTO v_allow_multi;

  IF v_allow_multi THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*), MAX(l.name)
  INTO v_existing_count, v_existing_team
  FROM public.member_league_registrations mlr
  JOIN public.leagues l ON l.id = mlr.league_id
  WHERE mlr.club_member_id = NEW.club_member_id
    AND l.association_id = v_assoc_id
    AND mlr.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(mlr.is_reserve, false) = false
    AND l.name !~* 'reserves?';

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'Member is already registered in another team (%) within this league association. Move them instead of adding a duplicate.', v_existing_team
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;