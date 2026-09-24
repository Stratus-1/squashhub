ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.can_host_at_club(_uid uuid, _club uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'admin') OR public.is_club_member(_uid, _club) OR EXISTS (
    WITH RECURSIVE up(org_id) AS (
      SELECT o.id FROM organisations o WHERE o.club_id = _club
      UNION
      SELECT r.parent_org_id FROM organisation_relationships r JOIN up ON r.child_org_id = up.org_id
      WHERE r.effective_to IS NULL OR r.effective_to > now()
    )
    SELECT 1 FROM up JOIN organisation_admins a ON a.org_id = up.org_id AND a.user_id = _uid AND a.active
  )
$$;

CREATE OR REPLACE FUNCTION public.tournament_host_courts(_club_ids uuid[])
RETURNS TABLE (court_id integer, name text, club_id uuid, is_external boolean, venue_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.club_id, COALESCE(c.is_external, false), c.venue_name
  FROM courts c
  WHERE c.club_id = ANY(_club_ids) AND c.active AND public.can_host_at_club(auth.uid(), c.club_id)
  ORDER BY c.club_id, c.id
$$;
REVOKE ALL ON FUNCTION public.tournament_host_courts(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tournament_host_courts(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_structured_match_court()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.court_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.court_id IS NOT DISTINCT FROM OLD.court_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM tournaments t WHERE t.id = NEW.champ_id AND t.builder_architecture = 'structured')
     AND NOT EXISTS (SELECT 1 FROM tournament_venues v WHERE v.tournament_id = NEW.champ_id AND NEW.court_id = ANY(v.court_ids)) THEN
    RAISE EXCEPTION 'court_not_selected: this court is not one of the tournament''s selected courts' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_structured_match_court ON public.club_champs_matches;
CREATE TRIGGER trg_guard_structured_match_court BEFORE INSERT OR UPDATE OF court_id ON public.club_champs_matches
FOR EACH ROW EXECUTE FUNCTION public.guard_structured_match_court();

CREATE OR REPLACE FUNCTION public.guard_structured_venue_court_removal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE removed integer[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tournaments t WHERE t.id = OLD.tournament_id AND t.builder_architecture = 'structured') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN removed := COALESCE(OLD.court_ids, '{}');
  ELSE removed := ARRAY(SELECT unnest(COALESCE(OLD.court_ids,'{}')) EXCEPT SELECT unnest(COALESCE(NEW.court_ids,'{}')));
  END IF;
  IF cardinality(removed) = 0 THEN RETURN COALESCE(NEW, OLD); END IF;
  IF EXISTS (SELECT 1 FROM club_champs_matches m WHERE m.champ_id = OLD.tournament_id AND m.court_id = ANY(removed) AND m.status = 'completed') THEN
    RAISE EXCEPTION 'court_has_history: played games on this court keep it' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM club_champs_matches m WHERE m.champ_id = OLD.tournament_id AND m.court_id = ANY(removed)) THEN
    RAISE EXCEPTION 'court_has_games: move the unplayed games on this court first' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_guard_structured_venue_court_removal ON public.tournament_venues;
CREATE TRIGGER trg_guard_structured_venue_court_removal BEFORE UPDATE OF court_ids OR DELETE ON public.tournament_venues
FOR EACH ROW EXECUTE FUNCTION public.guard_structured_venue_court_removal();