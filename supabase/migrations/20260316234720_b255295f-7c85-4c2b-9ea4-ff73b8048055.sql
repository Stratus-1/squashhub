
-- Clean up 27 duplicate club members (retry with fee payment dedup)
DO $$
DECLARE
  pair RECORD;
BEGIN
  FOR pair IN
    WITH ranked AS (
      SELECT id, lower(email) as em,
        ROW_NUMBER() OVER (PARTITION BY lower(email) ORDER BY joined_at ASC) as rn
      FROM club_members
      WHERE lower(email) IN (
        SELECT lower(email) FROM club_members
        WHERE email IS NOT NULL
        GROUP BY lower(email) HAVING count(*) > 1
      )
      AND lower(email) NOT IN ('demo@admin.co.za','info@casadeo.co.za')
    )
    SELECT
      (SELECT id FROM ranked r1 WHERE r1.em = r.em AND r1.rn = 1) as original_id,
      (SELECT id FROM ranked r2 WHERE r2.em = r.em AND r2.rn = 2) as dup_id
    FROM (SELECT DISTINCT em FROM ranked) r
  LOOP
    -- club_champs_entries
    UPDATE club_champs_entries SET club_member_id = pair.original_id WHERE club_member_id = pair.dup_id
      AND NOT EXISTS (SELECT 1 FROM club_champs_entries e2 WHERE e2.club_member_id = pair.original_id AND e2.champ_id = club_champs_entries.champ_id);
    DELETE FROM club_champs_entries WHERE club_member_id = pair.dup_id;

    -- club_champs_matches
    UPDATE club_champs_matches SET player_a_member_id = pair.original_id WHERE player_a_member_id = pair.dup_id;
    UPDATE club_champs_matches SET player_b_member_id = pair.original_id WHERE player_b_member_id = pair.dup_id;
    UPDATE club_champs_matches SET winner_member_id = pair.original_id WHERE winner_member_id = pair.dup_id;

    -- matches
    UPDATE matches SET player_a_member_id = pair.original_id WHERE player_a_member_id = pair.dup_id;
    UPDATE matches SET player_b_member_id = pair.original_id WHERE player_b_member_id = pair.dup_id;
    UPDATE matches SET winner_member_id = pair.original_id WHERE winner_member_id = pair.dup_id;
    UPDATE matches SET submitted_by_member_id = pair.original_id WHERE submitted_by_member_id = pair.dup_id;

    -- bookings
    UPDATE bookings SET club_member_id = pair.original_id WHERE club_member_id = pair.dup_id;
    UPDATE bookings SET opponent_member_id = pair.original_id WHERE opponent_member_id = pair.dup_id;

    -- challenges
    UPDATE challenges SET challenger_member_id = pair.original_id WHERE challenger_member_id = pair.dup_id;
    UPDATE challenges SET opponent_member_id = pair.original_id WHERE opponent_member_id = pair.dup_id;

    -- club_event_rsvps
    UPDATE club_event_rsvps SET club_member_id = pair.original_id WHERE club_member_id = pair.dup_id
      AND NOT EXISTS (SELECT 1 FROM club_event_rsvps r2 WHERE r2.club_member_id = pair.original_id AND r2.event_id = club_event_rsvps.event_id);
    DELETE FROM club_event_rsvps WHERE club_member_id = pair.dup_id;

    -- club_event_instance_rsvps
    UPDATE club_event_instance_rsvps SET club_member_id = pair.original_id WHERE club_member_id = pair.dup_id
      AND NOT EXISTS (SELECT 1 FROM club_event_instance_rsvps r2 WHERE r2.club_member_id = pair.original_id AND r2.instance_id = club_event_instance_rsvps.instance_id);
    DELETE FROM club_event_instance_rsvps WHERE club_member_id = pair.dup_id;

    -- club_member_fee_payments: delete duplicates (same fee_type+fee_label+season_year already exists on original)
    DELETE FROM club_member_fee_payments WHERE club_member_id = pair.dup_id
      AND EXISTS (SELECT 1 FROM club_member_fee_payments fp2 WHERE fp2.club_member_id = pair.original_id AND fp2.fee_type = club_member_fee_payments.fee_type AND fp2.fee_label = club_member_fee_payments.fee_label AND fp2.season_year = club_member_fee_payments.season_year);
    UPDATE club_member_fee_payments SET club_member_id = pair.original_id WHERE club_member_id = pair.dup_id;

    -- member_league_registrations
    UPDATE member_league_registrations SET club_member_id = pair.original_id WHERE club_member_id = pair.dup_id
      AND NOT EXISTS (SELECT 1 FROM member_league_registrations r2 WHERE r2.club_member_id = pair.original_id AND r2.league_id = member_league_registrations.league_id);
    DELETE FROM member_league_registrations WHERE club_member_id = pair.dup_id;

    -- member_credit_transactions
    UPDATE member_credit_transactions SET club_member_id = pair.original_id WHERE club_member_id = pair.dup_id;

    -- club_journal_entries
    UPDATE club_journal_entries SET club_member_id = pair.original_id WHERE club_member_id = pair.dup_id;

    -- club_events booked_by
    UPDATE club_events SET booked_by_member_id = pair.original_id WHERE booked_by_member_id = pair.dup_id;

    -- clubs delegate references
    UPDATE clubs SET chairman_member_id = pair.original_id WHERE chairman_member_id = pair.dup_id;
    UPDATE clubs SET secretary_member_id = pair.original_id WHERE secretary_member_id = pair.dup_id;
    UPDATE clubs SET club_captain_member_id = pair.original_id WHERE club_captain_member_id = pair.dup_id;

    -- Delete the duplicate member
    DELETE FROM club_members WHERE id = pair.dup_id;
  END LOOP;
END $$;
