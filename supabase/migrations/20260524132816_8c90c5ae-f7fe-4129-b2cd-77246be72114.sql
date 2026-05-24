CREATE OR REPLACE FUNCTION public.enforce_one_team_per_association()
RETURNS TRIGGER AS $$
DECLARE
  v_assoc_id uuid;
  v_target_is_reserve boolean := false;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;