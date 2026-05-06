
DO $$
DECLARE
  v_club uuid := '7eb88db5-b202-42dd-b9d8-cda434be2d59';
  v_user_ids uuid[];
  v_member_ids uuid[];
  v_league_ids uuid[];
  v_booking_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT user_id) FROM club_members WHERE club_id=v_club AND user_id IS NOT NULL INTO v_user_ids;
  SELECT array_agg(id) FROM club_members WHERE club_id=v_club INTO v_member_ids;
  SELECT array_agg(id) FROM leagues WHERE club_id=v_club INTO v_league_ids;
  SELECT array_agg(id) FROM bookings WHERE club_id=v_club INTO v_booking_ids;

  IF v_user_ids IS NOT NULL THEN
    v_user_ids := ARRAY(SELECT u FROM unnest(v_user_ids) u WHERE u NOT IN (SELECT user_id FROM user_roles WHERE role='admin'));
  END IF;

  -- League data
  IF v_league_ids IS NOT NULL THEN
    DELETE FROM league_fixture_lineups WHERE league_id = ANY(v_league_ids);
    DELETE FROM league_week_lineups WHERE league_id = ANY(v_league_ids);
    DELETE FROM league_week_player_status WHERE league_id = ANY(v_league_ids);
    DELETE FROM member_league_registrations WHERE league_id = ANY(v_league_ids);
  END IF;

  DELETE FROM league_week_availability WHERE club_id = v_club;
  DELETE FROM league_week_unavailability WHERE club_id = v_club;
  DELETE FROM leagues WHERE club_id = v_club;
  DELETE FROM league_associations WHERE club_id = v_club;

  IF v_member_ids IS NOT NULL THEN
    DELETE FROM member_association_affiliations WHERE club_member_id = ANY(v_member_ids);
    DELETE FROM club_member_permissions WHERE club_member_id = ANY(v_member_ids);
    DELETE FROM notifications WHERE club_member_id = ANY(v_member_ids);
  END IF;

  DELETE FROM matches WHERE club_id = v_club;
  DELETE FROM challenges WHERE club_id = v_club;
  IF v_booking_ids IS NOT NULL THEN
    DELETE FROM booking_invites WHERE booking_id = ANY(v_booking_ids);
  END IF;
  DELETE FROM bookings WHERE club_id = v_club;

  DELETE FROM club_journal_entries WHERE club_id = v_club;
  DELETE FROM member_credit_transactions WHERE club_id = v_club;
  DELETE FROM feed_posts WHERE club_id = v_club;

  DELETE FROM club_members WHERE club_id = v_club;
  DELETE FROM clubs WHERE id = v_club;

  IF v_user_ids IS NOT NULL AND array_length(v_user_ids,1) > 0 THEN
    DELETE FROM profiles WHERE id = ANY(v_user_ids);
    DELETE FROM auth.users WHERE id = ANY(v_user_ids);
  END IF;
END $$;
