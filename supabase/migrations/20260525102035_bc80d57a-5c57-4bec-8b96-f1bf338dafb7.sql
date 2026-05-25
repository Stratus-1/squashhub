DO $$
DECLARE
  src uuid := '1135c793-3133-4afa-811b-2deb4376e133'; -- Rachel Gates (duplicate)
  dst uuid := '55704b70-fb5a-4bf9-bbde-8d7856119ff1'; -- Rachel (active, with user_id)
BEGIN
  -- Reassign all child FK references from src -> dst

  UPDATE matches SET player_b_member_id = dst WHERE player_b_member_id = src;
  UPDATE matches SET player_a_member_id = dst WHERE player_a_member_id = src;
  UPDATE matches SET winner_member_id   = dst WHERE winner_member_id   = src;
  UPDATE matches SET winner_id          = dst WHERE winner_id          = src;
  UPDATE matches SET submitted_by_member_id = dst WHERE submitted_by_member_id = src;

  UPDATE bookings SET club_member_id     = dst WHERE club_member_id     = src;
  UPDATE bookings SET opponent_member_id = dst WHERE opponent_member_id = src;
  UPDATE bookings SET opponent_id        = dst WHERE opponent_id        = src;

  UPDATE challenges SET challenger_member_id = dst WHERE challenger_member_id = src;
  UPDATE challenges SET opponent_member_id   = dst WHERE opponent_member_id   = src;
  UPDATE challenges SET opponent_id          = dst WHERE opponent_id          = src;

  UPDATE club_champs_entries        SET club_member_id    = dst WHERE club_member_id    = src;
  UPDATE club_champs_entries        SET partner_member_id = dst WHERE partner_member_id = src;
  UPDATE club_champs_registrations  SET club_member_id    = dst WHERE club_member_id    = src;
  UPDATE club_champs_registrations  SET partner_member_id = dst WHERE partner_member_id = src;
  UPDATE club_champs_matches        SET player_a_member_id  = dst WHERE player_a_member_id  = src;
  UPDATE club_champs_matches        SET player_b_member_id  = dst WHERE player_b_member_id  = src;
  UPDATE club_champs_matches        SET partner_a_member_id = dst WHERE partner_a_member_id = src;
  UPDATE club_champs_matches        SET partner_b_member_id = dst WHERE partner_b_member_id = src;
  UPDATE club_champs_matches        SET winner_member_id    = dst WHERE winner_member_id    = src;
  UPDATE club_champs_matches        SET bye_member_id       = dst WHERE bye_member_id       = src;

  UPDATE club_member_ladder_history SET club_member_id = dst WHERE club_member_id = src;
  UPDATE club_member_fee_payments   SET club_member_id = dst WHERE club_member_id = src;
  UPDATE club_member_permissions    SET club_member_id = dst WHERE club_member_id = src;
  UPDATE notifications              SET club_member_id = dst WHERE club_member_id = src;
  UPDATE club_event_instance_rsvps  SET club_member_id = dst WHERE club_member_id = src;
  UPDATE club_event_rsvps           SET club_member_id = dst WHERE club_member_id = src;
  UPDATE bar_tab_entries            SET club_member_id = dst WHERE club_member_id = src;
  UPDATE member_credit_transactions SET club_member_id = dst WHERE club_member_id = src;
  UPDATE league_week_availability   SET club_member_id = dst WHERE club_member_id = src;
  UPDATE league_week_unavailability SET club_member_id = dst WHERE club_member_id = src;
  UPDATE league_week_player_status  SET club_member_id = dst WHERE club_member_id = src;
  UPDATE league_week_lineups        SET club_member_id = dst WHERE club_member_id = src;
  UPDATE league_fixture_lineups     SET club_member_id = dst WHERE club_member_id = src;
  UPDATE member_league_registrations SET club_member_id = dst WHERE club_member_id = src;
  UPDATE club_journal_entries       SET club_member_id = dst WHERE club_member_id = src;
  UPDATE access_events              SET club_member_id = dst WHERE club_member_id = src;
  UPDATE yoco_payment_sessions      SET club_member_id = dst WHERE club_member_id = src;
  UPDATE club_email_campaign_recipients SET club_member_id = dst WHERE club_member_id = src;
  UPDATE access_provisioning_log    SET club_member_id = dst WHERE club_member_id = src;

  -- Affiliations: dst already holds the NSC104 row for the same association.
  -- The src row is an empty placeholder. Drop it rather than re-assign (would violate unique key).
  DELETE FROM member_association_affiliations
    WHERE club_member_id = src;

  -- Promote name + email on the surviving record
  UPDATE club_members
    SET name  = 'Rachel Gates',
        email = COALESCE(email, 'rachel@rachel.com')
    WHERE id = dst;

  -- Remove the duplicate member shell
  DELETE FROM club_members WHERE id = src;
END $$;