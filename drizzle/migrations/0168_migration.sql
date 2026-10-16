CREATE OR REPLACE FUNCTION public.replace_unplayed_structured_stage(p_tid uuid, p_division_key text, p_stage_key text, p_new_stage jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_spec jsonb; v_div_idx int; v_stage_idx int; v_old jsonb; v_div_id uuid; v_stage_ids uuid[]; v_match_ids uuid[];
  v_played int; v_booked int; v_later int; v_club uuid;
BEGIN
  IF NOT public.can_manage_tournament(auth.uid(), p_tid) THEN
    RAISE EXCEPTION 'Not allowed to manage this tournament' USING ERRCODE = '42501';
  END IF;
  SELECT builder_spec, club_id INTO v_spec, v_club FROM public.tournaments
   WHERE id = p_tid AND builder_architecture = 'structured' FOR UPDATE;
  IF v_spec IS NULL THEN RAISE EXCEPTION 'Only structured tournaments can change a stage here'; END IF;

  SELECT (o - 1)::int INTO v_div_idx FROM jsonb_array_elements(v_spec->'divisions') WITH ORDINALITY AS d(v, o)
   WHERE d.v->>'divisionId' = p_division_key;
  IF v_div_idx IS NULL THEN RAISE EXCEPTION 'Unknown category'; END IF;
  SELECT (o - 1)::int, s.v INTO v_stage_idx, v_old FROM jsonb_array_elements(v_spec->'divisions'->v_div_idx->'stages') WITH ORDINALITY AS s(v, o)
   WHERE s.v->>'id' = p_stage_key;
  IF v_stage_idx IS NULL THEN RAISE EXCEPTION 'Unknown stage'; END IF;
  IF COALESCE((v_old->>'order')::int, 0) = 0 THEN RAISE EXCEPTION 'The first stage cannot be replaced here'; END IF;
  IF jsonb_typeof(p_new_stage) <> 'object' OR p_new_stage->>'id' IS DISTINCT FROM p_stage_key
     OR (p_new_stage->>'order')::int IS DISTINCT FROM (v_old->>'order')::int THEN
    RAISE EXCEPTION 'The new stage must keep the same id and position';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_spec->'divisions'->v_div_idx->'stages') s
              WHERE (s->>'order')::int > (v_old->>'order')::int) THEN
    RAISE EXCEPTION 'Only the last stage can be replaced';
  END IF;

  SELECT id INTO v_div_id FROM public.tournament_divisions WHERE tournament_id = p_tid AND spec_key = p_division_key;
  SELECT array_agg(id) INTO v_stage_ids FROM public.tournament_stages
   WHERE tournament_id = p_tid AND division_id = v_div_id AND spec_key = p_stage_key;
  SELECT array_agg(id) INTO v_match_ids FROM public.club_champs_matches
   WHERE champ_id = p_tid AND (stage_id = ANY(COALESCE(v_stage_ids, '{}'))
      OR (stage_key = p_stage_key AND group_number = v_div_idx + 1));

  SELECT count(*) INTO v_played FROM public.club_champs_matches
   WHERE id = ANY(COALESCE(v_match_ids, '{}')) AND (winner_member_id IS NOT NULL
      OR lower(COALESCE(status, '')) IN ('completed','confirmed','in_progress','walkover','forfeit'));
  IF v_played > 0 THEN RAISE EXCEPTION 'Refused: % game(s) in this stage are already played or started', v_played; END IF;
  SELECT count(*) INTO v_booked FROM public.club_champs_matches
   WHERE id = ANY(COALESCE(v_match_ids, '{}')) AND booking_id IS NOT NULL;
  IF v_booked > 0 THEN RAISE EXCEPTION 'Refused: % game(s) in this stage have court bookings — cancel those first', v_booked; END IF;

  DELETE FROM public.club_champs_matches WHERE id = ANY(COALESCE(v_match_ids, '{}'));
  DELETE FROM public.club_champs_rounds WHERE champ_id = p_tid AND stage_id = ANY(COALESCE(v_stage_ids, '{}'));
  DELETE FROM public.tournament_pools WHERE stage_id = ANY(COALESCE(v_stage_ids, '{}'));
  DELETE FROM public.tournament_stages WHERE id = ANY(COALESCE(v_stage_ids, '{}'));

  UPDATE public.tournaments
     SET builder_spec = jsonb_set(v_spec, ARRAY['divisions', v_div_idx::text, 'stages', v_stage_idx::text], p_new_stage)
   WHERE id = p_tid;

  INSERT INTO public.audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data, after_data)
  VALUES (v_club, auth.uid(), 'tournament_stage', p_tid, 'replace_unplayed_stage',
          'Organiser changed an unplayed later stage', jsonb_build_object('stage', v_old, 'removed_games', COALESCE(array_length(v_match_ids, 1), 0)),
          jsonb_build_object('stage', p_new_stage));

  RETURN jsonb_build_object('removed_games', COALESCE(array_length(v_match_ids, 1), 0));
END;
$$;
REVOKE ALL ON FUNCTION public.replace_unplayed_structured_stage(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_unplayed_structured_stage(uuid, text, text, jsonb) TO authenticated;