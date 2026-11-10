-- Android Player: club events, event join/leave, and the player's own
-- association league games, served through the EXISTING mobile RPCs only.
--
-- No tables, no new or parallel functions. Additive output only:
--   1. mobile_player_home_payload(...)        + "events" array (same signature).
--   2. join_club_event / leave_club_event      + defaulted p_sync_secret and
--      p_club_id. Ordinary two-argument web calls keep the unchanged
--      auth.uid()/email ownership check. A supplied secret must pass
--      mobile_internal_secret_ok (never falls back to the web check) and must
--      come with the Player API's verified club, which must equal both the
--      event's club and the member's club. The RPC only ever acts on the exact
--      _club_member_id passed in.
--      Web-path fix: the previous ownership test evaluated to NULL (and so
--      passed) for a signed-out caller or a caller without a profile row,
--      letting such callers join or remove any member. NULL now denies; the
--      owner and shared-email family checks are otherwise unchanged.
--      join_club_event also takes defaulted p_response ('confirmed' |
--      'declined') and p_instance_id, used ONLY by the Player API (secret
--      path) to answer the member's own existing invitation: exact club,
--      exact member, active membership, active event, an existing non-'left'
--      invitation row, and a scheduled, not-yet-started occurrence of this
--      event (series reply only for a one-off event without a scheduled
--      occurrence). Only that member's reply row is written. Without
--      p_response the open self-join behaviour is unchanged, and
--      invitation-only events still cannot be self-joined. Web callers
--      supplying a reply are refused (the web keeps its existing row update).
--   3. mobile_player_competition_payload(...)  + "leagues" object (same
--      signature); rankings/tournaments output unchanged, read-only.
--
-- Web semantics mirrored (src/components/CreateClubEvent.tsx, EventDetail.tsx,
-- src/pages/LeagueGames.tsx, UpcomingFixturesTab.tsx, IndividualStandingsTab.tsx):
--   * Events list: club events with status 'active' whose last occurrence has
--     not ended (start_date + (num_instances-1) weekly/monthly/yearly steps,
--     same end-of-day rounding as the web list), Johannesburg time.
--   * Next date: first non-cancelled occurrence from today, else start_date.
--   * Attendance is occurrence-scoped: for repeating events the member's
--     status is their reply for the next scheduled occurrence, defaulting to
--     'invited' while they are on the series; one-off events use the series
--     reply. 'left' on the series always wins.
--   * Join is offered only when the member is not on the event and the
--     organiser allowed self-join; invitation-only events never offer join.
--   * Events capability: hidden when the club has capability rows but
--     'events' is not enabled (fails open like CapabilityRoute).
--   * Membership scope: pending-approval or resigned members get no events.
--   * Only the requesting member's own reply rows are returned; no other
--     players' names, replies or counts; no organiser/admin fields.
--   * League games: the member's own registrations on non-archived club teams
--     of this club's associations; fixtures from platform_league_fixtures in
--     that association's fixture feed, matched to the member's team by team
--     id (code fallback only for rows without a team id), deduplicated like
--     the web list; results are raw saved totals and the member's own rubbers.
--     No standings are calculated.

-- 1. Home payload: events.
CREATE OR REPLACE FUNCTION public.mobile_player_home_payload(p_sync_secret text, p_club_id uuid, p_member_id uuid, p_from date DEFAULT CURRENT_DATE, p_to date DEFAULT (CURRENT_DATE + 7))
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_payload jsonb;
  v_notifications jsonb;
  v_club public.clubs%ROWTYPE;
  v_events jsonb := '[]'::jsonb;
  v_local_now timestamp := (now() AT TIME ZONE 'Africa/Johannesburg');
  v_today date := (now() AT TIME ZONE 'Africa/Johannesburg')::date;
BEGIN
  v_payload := public.mobile_player_home_payload_base(p_sync_secret, p_club_id, p_member_id, p_from, p_to);
  SELECT * INTO v_member FROM public.club_members WHERE id = p_member_id AND club_id = p_club_id LIMIT 1;
  SELECT COALESCE(jsonb_agg(to_jsonb(notification_row) ORDER BY notification_row.created_at DESC), '[]'::jsonb)
  INTO v_notifications
  FROM (
    SELECT n.id, n.type, n.title, n.message, n.read, n.created_at, n.url
    FROM public.notifications n
    WHERE n.club_member_id = p_member_id
       OR (
         v_member.user_id IS NOT NULL
         AND (
           n.user_id = v_member.user_id
           OR n.club_member_id IN (
             SELECT linked.id FROM public.club_members linked WHERE linked.user_id = v_member.user_id
           )
         )
       )
    ORDER BY n.created_at DESC
    LIMIT 100
  ) notification_row;
  SELECT * INTO v_club FROM public.clubs WHERE id = p_club_id LIMIT 1;

  IF NOT COALESCE(v_member.is_pending_approval, false)
     AND lower(COALESCE(v_member.status::text, '')) NOT IN ('resigned', 'cancelled', 'rejected', 'archived')
     AND (
       COALESCE(v_club.tenant_type, '') = 'association'
       OR NOT EXISTS (SELECT 1 FROM public.club_capabilities cc WHERE cc.club_id = p_club_id)
       OR EXISTS (SELECT 1 FROM public.club_capabilities cc WHERE cc.club_id = p_club_id AND cc.capability = 'events' AND cc.enabled)
     )
  THEN
    SELECT COALESCE(jsonb_agg(x.ev ORDER BY x.next_date, x.start_time, x.title, x.id), '[]'::jsonb)
    INTO v_events
    FROM (
      SELECT e.id, e.title, e.start_time,
        COALESCE(nd.instance_date, e.start_date) AS next_date,
        jsonb_build_object(
          'id', e.id,
          'title', e.title,
          'description', e.description,
          'eventType', e.event_type,
          'recurrence', e.recurrence,
          'dayOfWeek', e.day_of_week,
          'startDate', e.start_date,
          'startTime', e.start_time,
          'endTime', e.end_time,
          'nextDate', COALESCE(nd.instance_date, e.start_date),
          'occurrence', CASE WHEN occ.id IS NULL THEN NULL
                             ELSE jsonb_build_object('id', occ.id, 'date', occ.instance_date) END,
          'allowSelfJoin', COALESCE(e.allow_self_join, false),
          'invitationOnly', NOT COALESCE(e.allow_self_join, false),
          'invited', sr.id IS NOT NULL,
          'myStatus', COALESCE(st.my_status, 'not_invited'),
          'rsvpId', sr.id,
          'occurrenceRsvpId', CASE WHEN sr.id IS NOT NULL AND sr.status <> 'left' THEN ir.id END,
          'actions', jsonb_build_object(
            'canJoin', sr.id IS NULL AND COALESCE(e.allow_self_join, false),
            'canLeave', sr.id IS NOT NULL AND sr.status <> 'left',
            -- Exactly what join_club_event(p_response, p_instance_id) accepts.
            'canRespond', rt.target IS NOT NULL,
            'respondTarget', rt.target,
            'respondInstanceId', CASE WHEN rt.target = 'occurrence' THEN occ.id END
          )
        ) AS ev
      FROM public.club_events e
      LEFT JOIN LATERAL (
        SELECT i.id, i.instance_date
        FROM public.club_event_instances i
        WHERE i.event_id = e.id AND i.status = 'scheduled' AND i.instance_date >= v_today
        ORDER BY i.instance_date
        LIMIT 1
      ) occ ON true
      LEFT JOIN LATERAL (
        SELECT i.instance_date
        FROM public.club_event_instances i
        WHERE i.event_id = e.id AND lower(i.status) <> 'cancelled' AND i.instance_date >= v_today
        ORDER BY i.instance_date
        LIMIT 1
      ) nd ON true
      LEFT JOIN public.club_event_rsvps sr
        ON sr.event_id = e.id AND sr.club_member_id = p_member_id
      LEFT JOIN public.club_event_instance_rsvps ir
        ON ir.instance_id = occ.id AND ir.club_member_id = p_member_id
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN sr.id IS NULL THEN NULL
          WHEN sr.status = 'left' THEN 'left'
          WHEN ir.id IS NOT NULL THEN ir.status
          WHEN e.recurrence <> 'once' THEN 'invited'
          ELSE sr.status
        END AS my_status
      ) st
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN sr.id IS NULL OR sr.status = 'left' THEN NULL
          WHEN occ.id IS NOT NULL THEN
            CASE WHEN occ.instance_date + COALESCE(e.start_time, time '00:00') > v_local_now THEN 'occurrence' END
          WHEN COALESCE(e.recurrence, 'once') = 'once'
               AND e.start_date + COALESCE(e.start_time, time '00:00') > v_local_now THEN 'series'
          ELSE NULL
        END AS target
      ) rt
      CROSS JOIN LATERAL (
        SELECT CASE e.recurrence
          WHEN 'weekly' THEN e.start_date + (GREATEST(COALESCE(NULLIF(e.num_instances, 0), 1), 1) - 1) * 7
          WHEN 'monthly' THEN (e.start_date + make_interval(months => GREATEST(COALESCE(NULLIF(e.num_instances, 0), 1), 1) - 1))::date
          WHEN 'yearly' THEN (e.start_date + make_interval(years => GREATEST(COALESCE(NULLIF(e.num_instances, 0), 1), 1) - 1))::date
          ELSE e.start_date
        END AS last_date
      ) ld
      WHERE e.club_id = p_club_id
        AND e.status = 'active'
        -- Same end-of-day rounding as the web list (hour 0 -> 23, minute 0 -> 59).
        AND ld.last_date + make_time(
              CASE WHEN extract(hour FROM e.end_time)::int = 0 THEN 23 ELSE extract(hour FROM e.end_time)::int END,
              CASE WHEN extract(minute FROM e.end_time)::int = 0 THEN 59 ELSE extract(minute FROM e.end_time)::int END,
              59.999) >= v_local_now
    ) x;
  END IF;

  RETURN jsonb_set(jsonb_set(v_payload, '{notifications}', v_notifications, true), '{events}', v_events, true);
END;
$function$;

-- 2. join_club_event / leave_club_event: defaulted p_sync_secret + p_club_id
-- (join also: p_response + p_instance_id for the Player API invitation reply).
-- Adding defaulted parameters changes the signature, so each old two-argument
-- function is replaced inside this single transaction (no parallel function).

DROP FUNCTION IF EXISTS public.join_club_event(uuid, uuid);
DROP FUNCTION IF EXISTS public.join_club_event(uuid, uuid, text, uuid);

CREATE FUNCTION public.join_club_event(_event_id uuid, _club_member_id uuid, p_sync_secret text DEFAULT NULL, p_club_id uuid DEFAULT NULL, p_response text DEFAULT NULL, p_instance_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event public.club_events%ROWTYPE;
  v_member public.club_members%ROWTYPE;
  v_rsvp public.club_event_rsvps%ROWTYPE;
  v_inst public.club_event_instances%ROWTYPE;
  v_rsvp_id uuid;
  v_local_now timestamp := (now() AT TIME ZONE 'Africa/Johannesburg');
  v_today date := (now() AT TIME ZONE 'Africa/Johannesburg')::date;
  r RECORD;
BEGIN
  IF p_sync_secret IS NOT NULL THEN
    IF public.mobile_internal_secret_ok(p_sync_secret) IS NOT TRUE THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    IF p_club_id IS NULL THEN
      RAISE EXCEPTION 'Club is required' USING ERRCODE = '42501';
    END IF;
  ELSIF p_response IS NOT NULL OR p_instance_id IS NOT NULL THEN
    -- Invitation replies through this RPC exist only for the Player API.
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_instance_id IS NOT NULL AND p_response IS NULL THEN
    RAISE EXCEPTION 'Reply is required';
  END IF;
  IF p_response IS NOT NULL AND p_response NOT IN ('confirmed', 'declined') THEN
    RAISE EXCEPTION 'Reply must be confirmed or declined';
  END IF;

  SELECT * INTO v_event FROM public.club_events WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF p_club_id IS NOT NULL AND v_event.club_id IS DISTINCT FROM p_club_id THEN
    RAISE EXCEPTION 'Event is not in this club' USING ERRCODE = '42501';
  END IF;
  IF p_response IS NULL AND NOT COALESCE(v_event.allow_self_join, false) THEN
    RAISE EXCEPTION 'This event is invitation only';
  END IF;
  IF COALESCE(v_event.status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'This event is not open';
  END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = _club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.club_id <> v_event.club_id THEN
    RAISE EXCEPTION 'Member is not in this club';
  END IF;
  IF p_sync_secret IS NOT NULL THEN
    IF COALESCE(v_member.is_pending_approval, false)
       OR lower(COALESCE(v_member.status::text, '')) IN ('resigned', 'cancelled', 'rejected', 'archived') THEN
      RAISE EXCEPTION 'Membership is not active' USING ERRCODE = '42501';
    END IF;
  ELSIF auth.uid() IS NULL
     OR (v_member.user_id IS DISTINCT FROM auth.uid()
         AND NOT COALESCE(v_member.email IS NOT NULL
              AND v_member.email = (SELECT email FROM public.profiles WHERE id = auth.uid()), false)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Player API invitation reply: only this member's existing invitation.
  IF p_response IS NOT NULL THEN
    SELECT * INTO v_rsvp FROM public.club_event_rsvps
     WHERE event_id = _event_id AND club_member_id = _club_member_id;
    IF NOT FOUND OR v_rsvp.status = 'left' THEN
      RAISE EXCEPTION 'No invitation for this member' USING ERRCODE = '42501';
    END IF;

    IF p_instance_id IS NOT NULL THEN
      SELECT * INTO v_inst FROM public.club_event_instances WHERE id = p_instance_id;
      IF NOT FOUND OR v_inst.event_id IS DISTINCT FROM _event_id THEN
        RAISE EXCEPTION 'Occurrence is not part of this event' USING ERRCODE = '42501';
      END IF;
      IF v_inst.status IS DISTINCT FROM 'scheduled' THEN
        RAISE EXCEPTION 'This occurrence is not scheduled';
      END IF;
      IF v_inst.instance_date + COALESCE(v_event.start_time, time '00:00') <= v_local_now THEN
        RAISE EXCEPTION 'This occurrence has already started';
      END IF;
      INSERT INTO public.club_event_instance_rsvps (instance_id, club_member_id, status)
      VALUES (p_instance_id, _club_member_id, p_response)
      ON CONFLICT (instance_id, club_member_id)
        DO UPDATE SET status = EXCLUDED.status, updated_at = now()
      RETURNING id INTO v_rsvp_id;
      RETURN v_rsvp_id;
    END IF;

    -- Series reply: one-off events without a scheduled occurrence only.
    IF COALESCE(v_event.recurrence, 'once') <> 'once'
       OR EXISTS (SELECT 1 FROM public.club_event_instances i
                   WHERE i.event_id = _event_id AND i.status = 'scheduled' AND i.instance_date >= v_today) THEN
      RAISE EXCEPTION 'Occurrence is required';
    END IF;
    IF v_event.start_date + COALESCE(v_event.start_time, time '00:00') <= v_local_now THEN
      RAISE EXCEPTION 'This event has already started';
    END IF;
    UPDATE public.club_event_rsvps
       SET status = p_response, updated_at = now()
     WHERE id = v_rsvp.id
    RETURNING id INTO v_rsvp_id;
    RETURN v_rsvp_id;
  END IF;

  INSERT INTO public.club_event_rsvps (event_id, club_member_id, status)
  VALUES (_event_id, _club_member_id, 'confirmed')
  ON CONFLICT (event_id, club_member_id) DO UPDATE SET status = 'confirmed'
  RETURNING id INTO v_rsvp_id;

  IF v_rsvp_id IS NULL THEN
    SELECT id INTO v_rsvp_id FROM public.club_event_rsvps
     WHERE event_id = _event_id AND club_member_id = _club_member_id;
  END IF;

  FOR r IN SELECT id FROM public.club_event_instances
            WHERE event_id = _event_id AND instance_date >= CURRENT_DATE
  LOOP
    INSERT INTO public.club_event_instance_rsvps (instance_id, club_member_id, status)
    VALUES (r.id, _club_member_id, CASE WHEN r.id = (SELECT id FROM public.club_event_instances WHERE event_id=_event_id AND status='scheduled' AND instance_date >= (now() AT TIME ZONE 'Africa/Johannesburg')::date ORDER BY instance_date LIMIT 1) THEN 'confirmed' ELSE 'invited' END)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_rsvp_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_club_event(uuid, uuid, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_club_event(uuid, uuid, text, uuid, text, uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.leave_club_event(uuid, uuid);

CREATE FUNCTION public.leave_club_event(_event_id uuid, _club_member_id uuid, p_sync_secret text DEFAULT NULL, p_club_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event public.club_events%ROWTYPE;
  v_member public.club_members%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF p_sync_secret IS NOT NULL THEN
    IF public.mobile_internal_secret_ok(p_sync_secret) IS NOT TRUE THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
    IF p_club_id IS NULL THEN
      RAISE EXCEPTION 'Club is required' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_event FROM public.club_events WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF p_club_id IS NOT NULL AND v_event.club_id IS DISTINCT FROM p_club_id THEN
    RAISE EXCEPTION 'Event is not in this club' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = _club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.club_id <> v_event.club_id THEN
    RAISE EXCEPTION 'Member is not in this club';
  END IF;
  IF p_sync_secret IS NULL
     AND (auth.uid() IS NULL
          OR (v_member.user_id IS DISTINCT FROM auth.uid()
              AND NOT COALESCE(v_member.email IS NOT NULL
                   AND v_member.email = (SELECT email FROM public.profiles WHERE id = auth.uid()), false))) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.club_event_rsvps
     SET status = 'left', updated_at = now()
   WHERE event_id = _event_id
     AND club_member_id = _club_member_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.club_event_instance_rsvps ir
     SET status = 'left', updated_at = now()
    FROM public.club_event_instances ci
   WHERE ir.instance_id = ci.id
     AND ci.event_id = _event_id
     AND ir.club_member_id = _club_member_id
     AND ci.instance_date >= CURRENT_DATE;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.leave_club_event(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_club_event(uuid, uuid, text, uuid) TO anon, authenticated, service_role;

-- 3. Competition payload: leagues.
CREATE OR REPLACE FUNCTION public.mobile_player_competition_payload(p_sync_secret text, p_club_id uuid, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_m public.club_members%ROWTYPE; v_club_rank jsonb; v_national_rank jsonb; v_rankings jsonb; v_tournaments jsonb;
  v_codes text[]; v_leagues jsonb;
  v_today date := (now() AT TIME ZONE 'Africa/Johannesburg')::date;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_m FROM public.club_members WHERE id=p_member_id AND club_id=p_club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE='42501'; END IF;

  SELECT jsonb_build_object('snapshotRank',e.rank,'snapshotPeriod',s.period_start,'snapshotRankingPoints',e.ranking_points)
    INTO v_club_rank
    FROM public.club_ranking_snapshot_entries e JOIN public.club_ranking_snapshots s ON s.id=e.snapshot_id
    WHERE e.club_id=p_club_id AND s.club_id=p_club_id AND e.club_member_id=p_member_id
    ORDER BY s.period_start DESC LIMIT 1;

  SELECT jsonb_build_object('rank',se.rank,'previousRank',se.previous_rank,'points',se.score,
      'playerCode',se.player_code,'computedAt',rs.computed_at)
    INTO v_national_rank
    FROM public.ranking_snapshots rs
    JOIN public.ranking_snapshot_entries se ON se.snapshot_id=rs.id
    WHERE rs.association_id IS NULL AND se.association_id IS NULL AND se.category='ALL'
      AND ((v_m.person_id IS NOT NULL AND se.person_id=v_m.person_id)
        OR (v_m.person_id IS NULL AND se.player_code IN (
          SELECT a.league_association_number FROM public.member_association_affiliations a
          WHERE a.club_member_id=p_member_id AND a.active AND a.league_association_number IS NOT NULL)))
    ORDER BY rs.computed_at DESC LIMIT 1;

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
        'officialRank',rk.rank,'previousRank',rk.previous_rank,'points',rk.score,'category',rk.category,'snapshotAt',rk.computed_at,
        'rankAvailable',rk.rank IS NOT NULL))
      FROM public.member_association_affiliations a
      JOIN public.league_associations la ON la.id=a.association_id
      LEFT JOIN LATERAL (
        SELECT se.rank, se.previous_rank, se.score, se.category, rs.computed_at
        FROM public.ranking_snapshot_entries se JOIN public.ranking_snapshots rs ON rs.id=se.snapshot_id
        WHERE se.association_id=a.association_id AND se.category='ALL'
          AND v_m.person_id IS NOT NULL AND se.person_id=v_m.person_id
        ORDER BY rs.computed_at DESC LIMIT 1) rk ON true
      WHERE a.club_member_id=p_member_id AND a.active),'[]'::jsonb),
    'national', jsonb_build_object(
      'nationalPlayerNumber',(SELECT p.national_player_number FROM public.people p WHERE p.id=v_m.person_id),
      'ssaMembershipNumber',(SELECT p.ssa_membership_number FROM public.people p WHERE p.id=v_m.person_id),
      'officialRank',v_national_rank->'rank','previousRank',v_national_rank->'previousRank',
      'points',v_national_rank->'points','computedAt',v_national_rank->'computedAt',
      'rankAvailable',(v_national_rank->>'rank') IS NOT NULL));

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

  -- Player's own identifiers, used only to recognise them in rubbers on their
  -- own team's side where the rubber has no member id.
  SELECT COALESCE(array_agg(DISTINCT c), ARRAY[]::text[]) INTO v_codes FROM (
    SELECT upper(trim(v_m.club_member_number::text)) AS c
    UNION SELECT upper(trim(a.league_association_number)) FROM public.member_association_affiliations a
      WHERE a.club_member_id=p_member_id AND a.active
    UNION SELECT upper(trim(r.league_association_number)) FROM public.member_league_registrations r
      WHERE r.club_member_id=p_member_id
  ) s WHERE NULLIF(c,'') IS NOT NULL;

  WITH my_teams AS (
    SELECT r.id AS reg_id, r.league_id, r.is_reserve, r.is_captain, r.player_rank, r.league_association_number,
           l.name, l.code, l.division, l.category, l.season_year, l.season_id, l.association_id,
           la.name AS association_name, la.abbreviation, la.scope, la.platform_association_id
    FROM public.member_league_registrations r
    JOIN public.leagues l ON l.id=r.league_id AND l.club_id=p_club_id AND l.archived_at IS NULL
    JOIN public.league_associations la ON la.id=l.association_id AND la.club_id=p_club_id
    WHERE r.club_member_id=p_member_id
  ),
  matched AS (
    SELECT DISTINCT ON (f.id) f.*, t.league_id AS my_league_id, t.association_id AS my_association_id, s.side
    FROM my_teams t
    JOIN public.platform_league_fixtures f ON f.association_id=t.platform_association_id
    CROSS JOIN LATERAL (SELECT CASE
        WHEN f.home_team_id=t.league_id THEN 'home'
        WHEN f.away_team_id=t.league_id THEN 'away'
        WHEN f.home_team_id IS NULL AND NULLIF(trim(t.code),'') IS NOT NULL
             AND upper(trim(f.home_team_code))=upper(trim(t.code))
             AND (f.season_id IS NULL OR t.season_id IS NULL OR f.season_id=t.season_id)
             AND (f.division IS NULL OR t.division IS NULL OR f.division=t.division) THEN 'home'
        WHEN f.away_team_id IS NULL AND NULLIF(trim(t.code),'') IS NOT NULL
             AND upper(trim(f.away_team_code))=upper(trim(t.code))
             AND (f.season_id IS NULL OR t.season_id IS NULL OR f.season_id=t.season_id)
             AND (f.division IS NULL OR t.division IS NULL OR f.division=t.division) THEN 'away'
      END AS side) s
    WHERE s.side IS NOT NULL
    ORDER BY f.id, t.league_id
  ),
  dedup AS (
    -- Same duplicate rule as the web Upcoming list: prefer the round-linked
    -- row, then the newest.
    SELECT DISTINCT ON (m.association_id, m.fixture_date, upper(COALESCE(m.home_team_code,'')),
                        upper(COALESCE(m.away_team_code,'')), left(COALESCE(m.start_time::text,''),5), COALESCE(m.division,''))
           m.*
    FROM matched m
    ORDER BY m.association_id, m.fixture_date, upper(COALESCE(m.home_team_code,'')),
             upper(COALESCE(m.away_team_code,'')), left(COALESCE(m.start_time::text,''),5), COALESCE(m.division,''),
             (m.round_id IS NOT NULL) DESC, m.created_at DESC NULLS LAST
  ),
  fx AS (
    SELECT d.fixture_date >= v_today AS upcoming,
      row_number() OVER (PARTITION BY d.fixture_date >= v_today
        ORDER BY CASE WHEN d.fixture_date >= v_today THEN d.fixture_date END ASC,
                 CASE WHEN d.fixture_date < v_today THEN d.fixture_date END DESC,
                 CASE WHEN d.fixture_date >= v_today THEN d.start_time END ASC NULLS LAST,
                 CASE WHEN d.fixture_date < v_today THEN d.start_time END DESC NULLS LAST,
                 d.id) AS rn,
      d.fixture_date, d.start_time, d.id,
      jsonb_build_object(
        'id',d.id,'leagueId',d.my_league_id,'associationId',d.my_association_id,'seasonId',d.season_id,
        'date',d.fixture_date,'startTime',d.start_time,'endTime',d.end_time,'venueName',d.venue_name,
        'division',d.division,'status',d.status,'mySide',d.side,
        'home',jsonb_build_object('teamId',d.home_team_id,'code',d.home_team_code,'name',COALESCE(d.home_team_name_snapshot,d.home_team_code)),
        'away',jsonb_build_object('teamId',d.away_team_id,'code',d.away_team_code,'name',COALESCE(d.away_team_name_snapshot,d.away_team_code)),
        'score',d.score,'winnerTeamCode',d.winner_team_code,
        'result',(SELECT jsonb_build_object('status',fr.status,'winner',fr.winner,
            'homeTotalPoints',fr.home_total_points,'awayTotalPoints',fr.away_total_points,
            'homeTotalGames',fr.home_total_games,'awayTotalGames',fr.away_total_games)
          FROM public.league_fixture_results fr WHERE fr.fixture_id=d.id
          ORDER BY fr.updated_at DESC NULLS LAST LIMIT 1),
        'inMyLineup',EXISTS(SELECT 1 FROM public.league_fixture_lineups lf
          WHERE lf.fixture_id=d.id AND lf.club_member_id=p_member_id AND lf.club_id=p_club_id),
        'myLineup',(SELECT jsonb_build_object('position',lf.position,'rubberType',lf.rubber_type)
          FROM public.league_fixture_lineups lf
          WHERE lf.fixture_id=d.id AND lf.club_member_id=p_member_id AND lf.club_id=p_club_id
          ORDER BY lf.position NULLS LAST LIMIT 1),
        'myRubbers',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'position',mr.position,'rubberType',mr.rubber_type,
            'partnerName',CASE WHEN d.side='home' THEN mr.home_player2_name ELSE mr.away_player2_name END,
            'opponentName',CASE WHEN d.side='home' THEN mr.away_player_name ELSE mr.home_player_name END,
            'opponentPartnerName',CASE WHEN d.side='home' THEN mr.away_player2_name ELSE mr.home_player2_name END,
            'gamesWon',CASE WHEN d.side='home' THEN mr.home_games_won ELSE mr.away_games_won END,
            'gamesLost',CASE WHEN d.side='home' THEN mr.away_games_won ELSE mr.home_games_won END,
            'won',CASE WHEN mr.winner IS NULL THEN NULL ELSE mr.winner=d.side END,
            'isForfeit',COALESCE(mr.is_forfeit,false),'gameScores',mr.game_scores)
            ORDER BY mr.position NULLS LAST)
          FROM public.league_match_results mr
          WHERE mr.fixture_id=d.id
            AND CASE WHEN d.side='home' THEN
                  mr.home_player_member_id=p_member_id OR mr.home_player2_member_id=p_member_id
                  OR (mr.home_player_member_id IS NULL AND EXISTS (SELECT 1 FROM unnest(regexp_split_to_array(upper(COALESCE(mr.home_player_code,'')),'\s*[&/,]\s*')) c WHERE trim(c)<>'' AND trim(c)=ANY(v_codes)))
                  OR (mr.home_player2_member_id IS NULL AND upper(trim(COALESCE(mr.home_player2_code,'')))=ANY(v_codes))
                ELSE
                  mr.away_player_member_id=p_member_id OR mr.away_player2_member_id=p_member_id
                  OR (mr.away_player_member_id IS NULL AND EXISTS (SELECT 1 FROM unnest(regexp_split_to_array(upper(COALESCE(mr.away_player_code,'')),'\s*[&/,]\s*')) c WHERE trim(c)<>'' AND trim(c)=ANY(v_codes)))
                  OR (mr.away_player2_member_id IS NULL AND upper(trim(COALESCE(mr.away_player2_code,'')))=ANY(v_codes))
                END IS TRUE),'[]'::jsonb)
      ) AS j
    FROM dedup d
  )
  SELECT jsonb_build_object(
    'readOnly',true,
    'standingsAvailable',false,
    'registrations',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'registrationId',t.reg_id,'leagueId',t.league_id,'leagueName',t.name,'teamCode',t.code,
        'division',t.division,'category',t.category,'seasonYear',t.season_year,'seasonId',t.season_id,
        'isReserve',t.is_reserve,'isCaptain',t.is_captain,'officialRank',t.player_rank,'leagueNumber',t.league_association_number,
        'association',jsonb_build_object('id',t.association_id,'name',t.association_name,'abbreviation',t.abbreviation,
          'scope',t.scope,'hasFixtureFeed',t.platform_association_id IS NOT NULL))
        ORDER BY t.association_name, t.name, t.league_id) FROM my_teams t),'[]'::jsonb),
    'upcomingFixtures',COALESCE((SELECT jsonb_agg(fx.j ORDER BY fx.rn) FROM fx WHERE fx.upcoming AND fx.rn<=50),'[]'::jsonb),
    'results',COALESCE((SELECT jsonb_agg(fx.j ORDER BY fx.rn) FROM fx WHERE NOT fx.upcoming AND fx.rn<=50),'[]'::jsonb)
  ) INTO v_leagues;

  RETURN jsonb_build_object('readOnly',true,'clubId',p_club_id,'memberId',p_member_id,
    'rankings',v_rankings,'tournaments',v_tournaments,'leagues',v_leagues);
END; $function$;

NOTIFY pgrst, 'reload schema';
