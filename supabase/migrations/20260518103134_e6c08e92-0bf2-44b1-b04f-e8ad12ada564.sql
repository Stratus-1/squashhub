
CREATE OR REPLACE FUNCTION public.enforce_one_team_per_association()
RETURNS TRIGGER AS $$
DECLARE
  v_assoc_id uuid;
  v_existing_count int;
  v_existing_team text;
BEGIN
  SELECT association_id INTO v_assoc_id FROM public.leagues WHERE id = NEW.league_id;
  IF v_assoc_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*), MAX(l.name)
  INTO v_existing_count, v_existing_team
  FROM public.member_league_registrations mlr
  JOIN public.leagues l ON l.id = mlr.league_id
  WHERE mlr.club_member_id = NEW.club_member_id
    AND l.association_id = v_assoc_id
    AND mlr.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'Member is already registered in another team (%) within this league association. Move them instead of adding a duplicate.', v_existing_team
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_one_team_per_association ON public.member_league_registrations;
CREATE TRIGGER trg_enforce_one_team_per_association
BEFORE INSERT OR UPDATE OF club_member_id, league_id ON public.member_league_registrations
FOR EACH ROW EXECUTE FUNCTION public.enforce_one_team_per_association();
