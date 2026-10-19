CREATE OR REPLACE FUNCTION public.champ_fixture_minutes(_champ uuid, _group integer, _doubles boolean DEFAULT false)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT greatest(15, coalesce(
    CASE WHEN (t.group_durations->>_group::text) ~ '^[0-9]+$' THEN (t.group_durations->>_group::text)::integer END,
    CASE WHEN (t.beta_lifecycle->'format_plan'->'scheduling'->>(CASE WHEN _doubles THEN 'doubles' ELSE 'singles' END)) ~ '^[0-9]+$' THEN (t.beta_lifecycle->'format_plan'->'scheduling'->>(CASE WHEN _doubles THEN 'doubles' ELSE 'singles' END))::integer END,
    t.match_duration_minutes, 30))
  FROM public.tournaments t WHERE t.id = _champ;
$fn$;
REVOKE ALL ON FUNCTION public.champ_fixture_minutes(uuid,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.champ_fixture_minutes(uuid,integer,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_scheduled_championship_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
  -- Unowned capacity holds remain reservation envelopes, not player bookings.
  IF btrim(coalesce(NEW.external_booker_name,'')) ILIKE 'club championship%'
     AND NEW.user_id IS NULL AND NEW.club_member_id IS NULL
     AND NEW.opponent_id IS NULL AND NEW.opponent_member_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('champ-slot:' || NEW.court_id::text || ':' || NEW.date::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.club_champs_matches m
    WHERE m.booking_id IS NULL
      AND m.scheduled_date = NEW.date AND m.scheduled_time IS NOT NULL AND m.court_id IS NOT NULL
      AND NOT coalesce(m.is_bye,false)
      AND coalesce(m.status,'') NOT IN ('cancelled','forfeited','walkover')
      AND NOT (NEW.source = 'club_event' AND coalesce(NEW.external_id,'') = 'champ:' || m.champ_id::text || ':match:' || m.id::text)
      AND m.scheduled_time < NEW.end_time
      AND m.scheduled_time + make_interval(mins => coalesce(public.champ_fixture_minutes(m.champ_id,m.group_number,m.partner_a_member_id IS NOT NULL OR m.partner_b_member_id IS NOT NULL),30)) > NEW.start_time
      AND (m.court_id = NEW.court_id OR
        array_remove(ARRAY[m.player_a_member_id,m.player_b_member_id,m.partner_a_member_id,m.partner_b_member_id],NULL)
          && array_remove(ARRAY[NEW.club_member_id,NEW.opponent_member_id],NULL))
  ) THEN
    RAISE EXCEPTION 'A championship game is already scheduled at this time — please pick another slot' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.guard_scheduled_championship_booking() FROM PUBLIC;
CREATE TRIGGER trg_guard_scheduled_championship_booking
BEFORE INSERT OR UPDATE OF court_id,date,start_time,end_time,status,club_member_id,opponent_member_id,source,external_id
ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_scheduled_championship_booking();