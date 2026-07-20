
-- Merge duplicate Matt Strydom at Nelspruit Squash Club
-- OLD (CSV-import placeholder, keep nothing): c6a65869-04f8-4f49-a8e7-41dca839fabc  (NSC124)
-- NEW (real active member, has SA ID + league #): c778f91a-e6b9-4af4-bbfc-0d9ae15a7c21 (NSC192)
DO $$
DECLARE
  old_id uuid := 'c6a65869-04f8-4f49-a8e7-41dca839fabc';
  new_id uuid := 'c778f91a-e6b9-4af4-bbfc-0d9ae15a7c21';
BEGIN
  -- Bookings (member + opponent) — safe move
  UPDATE bookings SET club_member_id = new_id WHERE club_member_id = old_id;
  UPDATE bookings SET opponent_member_id = new_id WHERE opponent_member_id = old_id;

  -- Notifications — safe move
  UPDATE notifications SET club_member_id = new_id WHERE club_member_id = old_id;

  -- Member league registration — NEW has none, safe move
  UPDATE member_league_registrations SET club_member_id = new_id
   WHERE club_member_id = old_id
     AND NOT EXISTS (SELECT 1 FROM member_league_registrations x
                     WHERE x.club_member_id = new_id AND x.league_id = member_league_registrations.league_id);
  DELETE FROM member_league_registrations WHERE club_member_id = old_id;

  -- Tournament registrations: move only where NEW isn't already registered for the same champ
  UPDATE club_champs_registrations SET club_member_id = new_id
   WHERE club_member_id = old_id
     AND NOT EXISTS (SELECT 1 FROM club_champs_registrations x
                     WHERE x.club_member_id = new_id AND x.champ_id = club_champs_registrations.champ_id);
  DELETE FROM club_champs_registrations WHERE club_member_id = old_id;
  UPDATE club_champs_registrations SET partner_member_id = new_id WHERE partner_member_id = old_id;

  -- Event RSVPs: all conflict with NEW → drop OLD dupes
  DELETE FROM club_event_rsvps WHERE club_member_id = old_id;
  DELETE FROM club_event_instance_rsvps WHERE club_member_id = old_id;

  -- League week lineup(s): drop OLD (NEW is real player; slot may already be taken)
  DELETE FROM league_week_lineups WHERE club_member_id = old_id;

  -- Association affiliations: NEW already affiliated to same association → drop OLD
  DELETE FROM member_association_affiliations WHERE club_member_id = old_id;

  -- Ladder history — safe move
  UPDATE club_member_ladder_history SET club_member_id = new_id WHERE club_member_id = old_id;

  -- Finally remove the placeholder member row
  DELETE FROM club_members WHERE id = old_id;
END $$;
