ALTER TABLE public.tournaments ADD COLUMN ladder_update_mode text NOT NULL DEFAULT 'match' CHECK (ladder_update_mode IN ('match','final_standings'));
COMMENT ON COLUMN public.tournaments.ladder_update_mode IS 'Explicit final-standings opt-in; existing tournaments retain per-match behaviour until an organiser changes this.';

CREATE OR REPLACE FUNCTION public.champ_final_ladder(p_club_id uuid, p_champ_id uuid, p_group integer, p_order uuid[], p_apply boolean DEFAULT false, p_expected jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t public.tournaments%ROWTYPE; v_mixed boolean; v_moves jsonb; v_skipped jsonb; v_div jsonb; v_stage jsonb; v_source text;
BEGIN
 SELECT * INTO v_t FROM public.tournaments WHERE id=p_champ_id AND club_id=p_club_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found in this club'; END IF;
 IF NOT (public.has_role(auth.uid(),'admin') OR public.is_club_admin_or_permitted(auth.uid(),p_club_id,'ladder')) THEN RAISE EXCEPTION 'Club ladder permission is required'; END IF;
 IF p_order IS NULL OR cardinality(p_order)<2 OR cardinality(p_order) <> (SELECT count(DISTINCT id) FROM unnest(p_order) id) THEN RAISE EXCEPTION 'Final standings must contain distinct players'; END IF;
 IF EXISTS (SELECT 1 FROM unnest(p_order) id WHERE NOT EXISTS (SELECT 1 FROM public.club_champs_matches m WHERE m.champ_id=p_champ_id AND m.group_number=p_group AND (m.player_a_member_id=id OR m.player_b_member_id=id OR m.bye_member_id=id))) THEN RAISE EXCEPTION 'A player is not part of this category'; END IF;
 IF EXISTS (SELECT 1 FROM public.club_champs_matches WHERE champ_id=p_champ_id AND group_number=p_group AND (partner_a_member_id IS NOT NULL OR partner_b_member_id IS NOT NULL)) THEN RAISE EXCEPTION 'Doubles results cannot reorder the singles ladder'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.club_champs_matches WHERE champ_id=p_champ_id AND group_number=p_group AND NOT COALESCE(is_bye,false)) OR EXISTS (SELECT 1 FROM public.club_champs_matches WHERE champ_id=p_champ_id AND group_number=p_group AND NOT COALESCE(is_bye,false) AND lower(COALESCE(status,'')) NOT IN ('completed','confirmed','finished','walkover','forfeited','forfeit','cancelled','void')) THEN RAISE EXCEPTION 'Finish all category games before applying final standings'; END IF;
 IF v_t.builder_architecture='structured' THEN
  SELECT d INTO v_div FROM jsonb_array_elements(v_t.builder_spec->'divisions') d WHERE (d->>'groupNumber')::integer=p_group LIMIT 1;
  IF v_div IS NULL OR jsonb_array_length(COALESCE(v_div->'deferredStages','[]'::jsonb))>0 THEN RAISE EXCEPTION 'Complete the planned category stages first'; END IF;
  FOR v_stage IN SELECT s FROM jsonb_array_elements(v_div->'stages') s LOOP
   IF NOT EXISTS (SELECT 1 FROM public.club_champs_matches WHERE champ_id=p_champ_id AND group_number=p_group AND stage_key=v_stage->>'id') THEN RAISE EXCEPTION 'A planned stage has not been played'; END IF;
   IF v_stage->>'kind'='swiss' AND (SELECT COALESCE(max(round_number),0) FROM public.club_champs_matches WHERE champ_id=p_champ_id AND group_number=p_group AND stage_key=v_stage->>'id') < COALESCE((v_stage->>'swissRounds')::integer,1) THEN RAISE EXCEPTION 'Finish all configured Swiss rounds first'; END IF;
  END LOOP;
 END IF;
 SELECT COALESCE(mixed_ladder_enabled,false) INTO v_mixed FROM public.clubs WHERE id=p_club_id;
 PERFORM 1 FROM public.club_members WHERE club_id=p_club_id ORDER BY id FOR UPDATE;
 WITH players AS (
  SELECT cm.id,cm.ladder_position, CASE WHEN v_mixed THEN 'mixed' WHEN lower(COALESCE(cm.gender,'')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END AS grp, array_position(p_order,cm.id) AS finish
  FROM public.club_members cm WHERE cm.club_id=p_club_id AND cm.id=ANY(p_order) AND cm.ladder_position IS NOT NULL AND cm.status='active' AND cm.role<>'visitor'
 ), slots AS (SELECT grp,ladder_position,row_number() OVER (PARTITION BY grp ORDER BY ladder_position,id) n FROM players), finishers AS (SELECT *,row_number() OVER (PARTITION BY grp ORDER BY finish) n FROM players)
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'from',f.ladder_position,'to',s.ladder_position) ORDER BY f.grp,f.n) FILTER (WHERE f.ladder_position<>s.ladder_position),'[]'::jsonb) INTO v_moves FROM finishers f JOIN slots s ON s.grp=f.grp AND s.n=f.n;
 SELECT COALESCE(jsonb_agg(id),'[]'::jsonb) INTO v_skipped FROM unnest(p_order) id WHERE NOT EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id=id AND cm.club_id=p_club_id AND cm.ladder_position IS NOT NULL AND cm.status='active' AND cm.role<>'visitor');
 IF p_apply THEN
  IF p_expected IS NULL OR p_expected IS DISTINCT FROM v_moves THEN RAISE EXCEPTION 'The ladder changed; review a fresh preview before applying'; END IF;
  v_source:=current_setting('app.ladder_change_source',true);
  PERFORM set_config('app.ladder_change_source','admin_reorder',true);
  UPDATE public.club_members cm SET ladder_position=(m->>'to')::integer, updated_at=now() FROM jsonb_array_elements(v_moves) m WHERE cm.id=(m->>'id')::uuid AND cm.club_id=p_club_id;
  PERFORM set_config('app.ladder_change_source',COALESCE(v_source,''),true);
 END IF;
 RETURN jsonb_build_object('moves',v_moves,'skipped',v_skipped,'applied',p_apply);
END $$;
REVOKE ALL ON FUNCTION public.champ_final_ladder(uuid,uuid,integer,uuid[],boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.champ_final_ladder(uuid,uuid,integer,uuid[],boolean,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.champ_set_final_ladder_mode(p_club_id uuid,p_champ_id uuid,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.is_club_admin_or_permitted(auth.uid(),p_club_id,'ladder')) THEN RAISE EXCEPTION 'Club ladder permission is required'; END IF;
 UPDATE public.tournaments SET ladder_update_mode=CASE WHEN p_enabled THEN 'final_standings' ELSE 'match' END WHERE id=p_champ_id AND club_id=p_club_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found in this club'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.champ_set_final_ladder_mode(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.champ_set_final_ladder_mode(uuid,uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.award_points_for_champ_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_club_id uuid; v_loser uuid; v_override boolean; v_enabled boolean; v_move text; v_timing text;
BEGIN
 IF NEW.winner_member_id IS NULL OR COALESCE(NEW.is_bye,false) OR NEW.partner_a_member_id IS NOT NULL OR NEW.partner_b_member_id IS NOT NULL OR lower(COALESCE(NEW.status,'')) NOT IN ('completed','confirmed','finished') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.winner_member_id IS NOT DISTINCT FROM NEW.winner_member_id AND lower(COALESCE(OLD.status,'')) IN ('completed','confirmed','finished') THEN RETURN NEW; END IF;
 IF NEW.player_a_member_id IS NULL OR NEW.player_b_member_id IS NULL THEN RETURN NEW; END IF;
 v_loser:=CASE WHEN NEW.winner_member_id=NEW.player_a_member_id THEN NEW.player_b_member_id ELSE NEW.player_a_member_id END;
 SELECT club_id,ladder_affects,ladder_update_mode INTO v_club_id,v_override,v_timing FROM public.tournaments WHERE id=NEW.champ_id;
 IF v_club_id IS NULL THEN RETURN NEW; END IF;
 PERFORM public.award_ranking_points_for_result(v_club_id,NEW.winner_member_id,v_loser,'tournament',NEW.id);
 IF v_timing='final_standings' THEN RETURN NEW; END IF;
 SELECT COALESCE(ladder_from_tournaments,true),COALESCE(tournament_movement_policy,movement_policy,'insert') INTO v_enabled,v_move FROM public.ladder_configs WHERE club_id=v_club_id;
 IF v_enabled IS DISTINCT FROM false AND COALESCE(v_override,v_enabled,false) IS TRUE THEN PERFORM public.apply_ladder_result(v_club_id,NEW.winner_member_id,v_loser,COALESCE(v_move,'insert'),'tournament',NEW.id); END IF;
 RETURN NEW;
END $$;