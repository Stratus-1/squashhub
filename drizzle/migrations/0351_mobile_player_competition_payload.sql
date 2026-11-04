-- Read-only player competition view for the GCP Player API. Reuses web-owned
-- tables only (club_members, people, member_association_affiliations,
-- member_league_registrations, club_champs*). No writes, no new tables.
CREATE OR REPLACE FUNCTION public.mobile_player_competition_payload(p_sync_secret text, p_club_id uuid, p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_m public.club_members%ROWTYPE; v_rankings jsonb; v_tournaments jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_m FROM public.club_members WHERE id=p_member_id AND club_id=p_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE='42501'; END IF;

  SELECT jsonb_build_object(
    'club', jsonb_build_object('ladderPosition',v_m.ladder_position,'crossGenderLadderPosition',v_m.cross_gender_ladder_position,
      'rankingPoints',v_m.ranking_points,'clubMemberNumber',v_m.club_member_number),
    'leagues', COALESCE((SELECT jsonb_agg(jsonb_build_object('leagueId',r.league_id,'leagueName',l.name,'playerRank',r.player_rank,
        'isReserve',r.is_reserve,'isCaptain',r.is_captain,'leagueNumber',r.league_association_number) ORDER BY l.name)
      FROM public.member_league_registrations r JOIN public.leagues l ON l.id=r.league_id
      WHERE r.club_member_id=p_member_id AND l.archived_at IS NULL),'[]'::jsonb),
    'associations', COALESCE((SELECT jsonb_agg(jsonb_build_object('associationId',a.association_id,'name',la.name,
        'abbreviation',la.abbreviation,'memberNumber',a.league_association_number))
      FROM public.member_association_affiliations a JOIN public.league_associations la ON la.id=a.association_id
      WHERE a.club_member_id=p_member_id AND a.active),'[]'::jsonb),
    'national', (SELECT jsonb_build_object('nationalPlayerNumber',p.national_player_number,'ssaMembershipNumber',p.ssa_membership_number)
      FROM public.people p WHERE p.id=v_m.person_id)
  ) INTO v_rankings;

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'startDate' DESC),'[]'::jsonb) INTO v_tournaments FROM (
    SELECT jsonb_build_object('id',c.id,'name',c.name,'status',c.status,'startDate',c.start_date,'endDate',c.end_date,
      'registrationStatus',reg.registration_status,'feeStatus',reg.fee_status,
      'matches',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'stage',m.stage,'stageLabel',m.stage_label,'round',m.round_number,
          'pool',COALESCE(m.pool_number,m.group_number),'scheduledDate',m.scheduled_date,'scheduledTime',m.scheduled_time,'courtId',m.court_id,
          'playBy',m.play_by,'status',m.status,'playerA',m.player_a_member_id,'playerB',m.player_b_member_id,
          'placeholderA',m.placeholder_a,'placeholderB',m.placeholder_b,'winner',m.winner_member_id,'score',m.score,'gameScores',m.game_scores,'isBye',m.is_bye)
          ORDER BY m.scheduled_date NULLS LAST, m.scheduled_time NULLS LAST, m.round_number)
        FROM public.club_champs_matches m WHERE m.champ_id=c.id
          AND p_member_id IN (m.player_a_member_id,m.player_b_member_id,m.partner_a_member_id,m.partner_b_member_id,m.bye_member_id)),'[]'::jsonb),
      'poolRecord',(SELECT jsonb_build_object('played',count(*) FILTER (WHERE m.winner_member_id IS NOT NULL),
          'won',count(*) FILTER (WHERE m.winner_member_id=p_member_id)) FROM public.club_champs_matches m
        WHERE m.champ_id=c.id AND NOT COALESCE(m.is_bye,false) AND p_member_id IN (m.player_a_member_id,m.player_b_member_id))
    ) t
    FROM public.club_champs c JOIN public.club_champs_registrations reg ON reg.champ_id=c.id AND reg.club_member_id=p_member_id
    WHERE c.club_id=p_club_id
  ) s;

  RETURN jsonb_build_object('readOnly',true,'rankings',v_rankings,'tournaments',v_tournaments,
    'standingsNote','Official standings and tie-breaks come from the web tournament view; poolRecord is a raw win tally.');
END; $$;
REVOKE ALL ON FUNCTION public.mobile_player_competition_payload(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_player_competition_payload(text,uuid,uuid) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';