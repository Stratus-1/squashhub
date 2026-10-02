-- One source of truth for which courts a tournament game may be booked on.
-- Owner != venue. Order: stage override (courts / venue) -> explicit venue court selections
-- -> legacy tournaments.court_ids -> default host club(s)' normally bookable courts.
-- Club events default to the owning club; regional/national events need an explicitly
-- stipulated host club (the owner's own tenant club never counts as an implied venue).
CREATE OR REPLACE FUNCTION public.tournament_event_kind(_champ uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN o.kind IS NULL OR o.kind = 'club' THEN 'club' ELSE 'regional' END
  FROM tournaments t LEFT JOIN organisations o ON o.id = t.owner_org_id WHERE t.id = _champ
$$;

CREATE OR REPLACE FUNCTION public.tournament_host_club_ids(_champ uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.tournament_event_kind(_champ) = 'club' THEN
      ARRAY(SELECT DISTINCT x FROM (
        SELECT v.club_id x FROM tournament_venues v WHERE v.tournament_id = _champ
        UNION SELECT t.club_id FROM tournaments t WHERE t.id = _champ AND t.club_id IS NOT NULL) s)
    ELSE
      ARRAY(SELECT DISTINCT v.club_id FROM tournament_venues v JOIN tournaments t ON t.id = v.tournament_id
            WHERE v.tournament_id = _champ AND (v.club_id <> t.club_id OR cardinality(v.court_ids) > 0))
  END
$$;

CREATE OR REPLACE FUNCTION public.tournament_bookable_court_ids(_champ uuid, _stage text DEFAULT NULL, _round_label text DEFAULT NULL)
RETURNS integer[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ss jsonb; k text; ov jsonb; ids integer[]; venue uuid;
BEGIN
  SELECT t.milestone_play_by->'stage_scheduling' INTO ss FROM tournaments t WHERE t.id = _champ;
  k := CASE
    WHEN _stage = 'playoff_qf' OR _round_label ~* 'quarter' THEN 'quarter_final'
    WHEN _stage = 'playoff_sf' OR _round_label ~* 'semi' THEN 'semi_final'
    WHEN _stage IN ('playoff_final','playoff_3rd') OR _round_label ~* '(\mfinal\M|3rd place|third)' THEN 'final'
    ELSE NULL END;
  ov := CASE WHEN k IS NOT NULL THEN ss->'playoffs'->k ELSE ss->'pools' END;
  IF ov IS NOT NULL AND jsonb_typeof(ov) = 'object' THEN
    IF jsonb_typeof(ov->'court_ids') = 'array' AND jsonb_array_length(ov->'court_ids') > 0 THEN
      SELECT array_agg(DISTINCT (x)::int) INTO ids FROM jsonb_array_elements_text(ov->'court_ids') x WHERE x ~ '^\d+$';
      IF cardinality(ids) > 0 THEN RETURN ids; END IF;
    END IF;
    IF nullif(ov->>'venue_club_id','') IS NOT NULL THEN
      venue := (ov->>'venue_club_id')::uuid;
      RETURN ARRAY(SELECT c.id FROM courts c WHERE c.club_id = venue AND c.active AND NOT COALESCE(c.is_external,false) ORDER BY c.id);
    END IF;
  END IF;
  SELECT array_agg(DISTINCT c) INTO ids FROM tournament_venues v, unnest(v.court_ids) c WHERE v.tournament_id = _champ;
  IF cardinality(ids) > 0 THEN RETURN ids; END IF;
  SELECT t.court_ids INTO ids FROM tournaments t WHERE t.id = _champ;
  IF cardinality(ids) > 0 THEN RETURN ids; END IF;
  RETURN ARRAY(SELECT c.id FROM courts c WHERE c.club_id = ANY(public.tournament_host_club_ids(_champ))
               AND c.active AND NOT COALESCE(c.is_external,false) ORDER BY c.id);
END $$;

GRANT EXECUTE ON FUNCTION public.tournament_event_kind(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.tournament_host_club_ids(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.tournament_bookable_court_ids(uuid, text, text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.guard_structured_match_court()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE lbl text;
BEGIN
  IF NEW.court_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.court_id IS NOT DISTINCT FROM OLD.court_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM tournaments t WHERE t.id = NEW.champ_id AND t.builder_architecture = 'structured') THEN
    SELECT r.label INTO lbl FROM club_champs_rounds r WHERE r.id = NEW.round_id;
    IF NOT (NEW.court_id = ANY(public.tournament_bookable_court_ids(NEW.champ_id, NEW.stage, lbl))) THEN
      IF public.tournament_event_kind(NEW.champ_id) = 'regional' AND cardinality(public.tournament_host_club_ids(NEW.champ_id)) = 0 THEN
        RAISE EXCEPTION 'venue_not_set: choose the host club/venue for this tournament first' USING ERRCODE = 'check_violation';
      END IF;
      RAISE EXCEPTION 'court_not_selected: this court is not one of the tournament''s courts' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;