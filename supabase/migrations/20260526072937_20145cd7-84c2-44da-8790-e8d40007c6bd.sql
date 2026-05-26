-- Treat allow_multi_team_registration as an association-level rule.
-- Older per-league rule rows defaulted this flag to false, which accidentally
-- overrode NSA/PCC's inherited association setting and kept the strict trigger active.
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

  -- Multi-team registration is association-scoped, not league-scoped.
  -- Prefer a tenant association override, then inherited platform association rules.
  SELECT COALESCE((
    SELECT lr.allow_multi_team_registration
    FROM public.league_rules lr
    LEFT JOIN public.league_associations la ON la.id = v_assoc_id
    WHERE lr.league_id IS NULL
      AND lr.association_id IN (v_assoc_id, la.platform_association_id)
    ORDER BY CASE WHEN lr.association_id = v_assoc_id THEN 0 ELSE 1 END
    LIMIT 1
  ), false)
  INTO v_allow_multi;

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