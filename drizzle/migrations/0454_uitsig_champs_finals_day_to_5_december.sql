DO $$
DECLARE
  v_champ uuid := 'f954222a-0f0a-4d8c-ac7b-9c74042cc69e';
  v_club uuid := 'd8397b8a-60d3-4c4b-afee-25dab218bf19';
  v_n int;
BEGIN
  -- Identify this one-off correction as a trusted server write (transaction-local only).
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE public.tournaments
     SET player_info = 'Finals day — Saturday 5 December 2026 (postponed from Saturday 21 November). All categories (except Men''s C and D) play their 3rd/4th play-offs and 1st/2nd place finals on this day. Swiss Round 5 therefore also plays on 5 December, with the top four positions paired on finals day.',
         builder_spec = replace(builder_spec::text, '"2026-11-21"', '"2026-12-05"')::jsonb,
         beta_lifecycle = replace(beta_lifecycle::text, '"2026-11-21"', '"2026-12-05"')::jsonb
   WHERE id = v_champ AND club_id = v_club;

  UPDATE public.tournament_stages
     SET config = replace(config::text, '"2026-11-21"', '"2026-12-05"')::jsonb
   WHERE tournament_id = v_champ AND config::text LIKE '%"2026-11-21"%';

  UPDATE public.club_champs_matches
     SET scheduled_date = DATE '2026-12-05'
   WHERE champ_id = v_champ
     AND scheduled_date = DATE '2026-11-21'
     AND round_number = 902
     AND status = 'scheduled'
     AND player_a_member_id IS NULL AND player_b_member_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 8 THEN RAISE EXCEPTION 'Expected 8 finals-day games, found %', v_n; END IF;

  INSERT INTO public.champ_round_date_audit (champ_id, club_id, changed_by, scope, round_number, stage_key, old_play_by, new_play_by, fixtures_affected, fixtures_protected)
  VALUES (v_champ, v_club, NULL, 'finals_day_postponed', 902, 'vmv6lrpfa-po2', DATE '2026-11-21', DATE '2026-12-05', v_n, 0);
END $$;