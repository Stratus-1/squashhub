-- Fix player names: club_members stores a single name column.
CREATE OR REPLACE FUNCTION public.mobile_player_competition_payload(p_sync_secret text, p_club_id uuid, p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_m public.club_members%ROWTYPE; v_club_rank jsonb; v_rankings jsonb; v_tournaments jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_m FROM public.club_members WHERE id=p_member_id AND club_id=p_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE='42501'; END IF;

  SELECT jsonb_build_object('snapshotRank',e.rank,'snapshotPeriod',s.period_start,'snapshotRankingPoints',e.ranking_points)
    INTO v_club_rank
    FROM public.club_ranking_snapshot_entries e JOIN public.club_ranking_snapshots s ON s.id=e.snapshot_id
    WHERE e.club_id=p_club_id AND s.club_id=p_club_id AND e.club_member_id=p_member_id
    ORDER BY s.period_start DESC LIMIT 1;

  v_rankings := jsonb_build_object(
    'club', jsonb_build_object(
      'ladderPosition', v_m.ladder_position,
      'crossGenderLadderPosition', v_m.cross_gender_ladder_position,
      'rankingPoints', v_m.ranking_points,
      'snapshotRank', v_club_rank->'snapshotRank',
      'snapshotPeriod', v_club_rank->'snapshotPeriod',
      'clubMemberNumber', v_m.club_member_number),
    'leagues', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'leagueId',r.league_id,'leagueName',l.name,'seasonYear',l.season_year,
        'officialRank',r.player_rank,'rankAvailable',r.player_rank IS NOT NULL,
        'isReserve',r.is_reserve,'isCaptain',r.is_captain,'leagueNumber',r.league_association_number) ORDER BY l.name)
      FROM public.member_league_registrations r JOIN public.leagues l ON l.id=r.league_id
      WHERE r.club_member_id=p_member_id AND l.club_id=p_club_id AND l.archived_at IS NULL),'[]'::jsonb),
    'associations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'associationId',a.association_id,'name',la.name,'abbreviation',la.abbreviation,
        'memberNumber',a.league_association_number,
        'officialRank',rk.rank,'category',rk.category,'snapshotAt',rk.computed_at,
        'rankAvailable',rk.rank IS NOT NULL))
      FROM public.member_association_affiliations a
      JOIN public.league_associations la ON la.id=a.association_id
      LEFT JOIN LATERAL (
        SELECT se.rank, se.category, rs.computed_at
        FROM public.ranking_snapshot_entries se JOIN public.ranking_snapshots rs ON rs.id=se.snapshot_id
        WHERE se.association_id=a.association_id AND v_m.person_id IS NOT NULL AND se.person_id=v_m.person_id
        ORDER BY rs.computed_at DESC LIMIT 1) rk ON true
      WHERE a.club_member_id=p_member_id AND a.active),'[]'::jsonb),
    'national', jsonb_build_object(
      'nationalPlayerNumber',(SELECT p.national_player_number FROM public.people p WHERE p.id=v_m.person_id),
      'ssaMembershipNumber',(SELECT p.ssa_membership_number FROM public.people p WHERE p.id=v_m.person_id),
      'officialRank',NULL,'rankAvailable',false));

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'startDate' DESC NULLS LAST),'[]'::jsonb) INTO v_tournaments FROM (
    SELECT jsonb_build_object('id',c.id,'name',c.name,'status',c.status,'startDate',c.start_date,'endDate',c.end_date,
      'registrationStatus',reg.registration_status,'feeStatus',reg.fee_status,
      'standing',NULL,'standingAvailable',false,
      'categories',COALESCE((
        SELECT jsonb_agg(cat ORDER BY cat->>'categoryLabel' NULLS LAST) FROM (
          SELECT jsonb_build_object('categoryId',m.division_id,'categoryLabel',d.label,
            'rounds',jsonb_agg(rnd ORDER BY rnd->>'stageLabel', (rnd->>'round')::int NULLS LAST)) cat
          FROM (
            SELECT m2.division_id, jsonb_build_object(
              'stageId',m2.stage_id,'stageLabel',COALESCE(st.label,m2.stage_label,m2.stage),'round',m2.round_number,
              'matches',jsonb_agg(jsonb_build_object(
                'id',m2.id,'pool',COALESCE(m2.pool_number,m2.group_number),
                'scheduledDate',m2.scheduled_date,'scheduledTime',m2.scheduled_time,'courtId',m2.court_id,'playBy',m2.play_by,
                'status',m2.status,'isBye',COALESCE(m2.is_bye,false),
                'sideA',jsonb_build_object('memberId',m2.player_a_member_id,'name',pa.name,
                   'partnerId',m2.partner_a_member_id,'partnerName',qa.name,'placeholder',m2.placeholder_a),
                'sideB',jsonb_build_object('memberId',m2.player_b_member_id,'name',pb.name,
                   'partnerId',m2.partner_b_member_id,'partnerName',qb.name,'placeholder',m2.placeholder_b),
                'winnerMemberId',m2.winner_member_id,'score',m2.score,'gameScores',m2.game_scores)
                ORDER BY m2.scheduled_date NULLS LAST, m2.scheduled_time NULLS LAST)) rnd
            FROM public.club_champs_matches m2
            LEFT JOIN public.tournament_stages st ON st.id=m2.stage_id
            LEFT JOIN public.club_members pa ON pa.id=m2.player_a_member_id AND pa.club_id=p_club_id
            LEFT JOIN public.club_members pb ON pb.id=m2.player_b_member_id AND pb.club_id=p_club_id
            LEFT JOIN public.club_members qa ON qa.id=m2.partner_a_member_id AND qa.club_id=p_club_id
            LEFT JOIN public.club_members qb ON qb.id=m2.partner_b_member_id AND qb.club_id=p_club_id
            WHERE m2.champ_id=c.id
              AND p_member_id IN (m2.player_a_member_id,m2.player_b_member_id,m2.partner_a_member_id,m2.partner_b_member_id,m2.bye_member_id)
            GROUP BY m2.division_id, m2.stage_id, COALESCE(st.label,m2.stage_label,m2.stage), m2.round_number
          ) m(division_id, rnd)
          LEFT JOIN public.tournament_divisions d ON d.id=m.division_id
          GROUP BY m.division_id, d.label
        ) cats),'[]'::jsonb)
    ) t
    FROM public.club_champs c
    JOIN public.club_champs_registrations reg ON reg.champ_id=c.id AND reg.club_member_id=p_member_id
    WHERE c.club_id=p_club_id
  ) s;

  RETURN jsonb_build_object('readOnly',true,'clubId',p_club_id,'memberId',p_member_id,
    'rankings',v_rankings,'tournaments',v_tournaments);
END; $$;
REVOKE ALL ON FUNCTION public.mobile_player_competition_payload(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_player_competition_payload(text,uuid,uuid) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';