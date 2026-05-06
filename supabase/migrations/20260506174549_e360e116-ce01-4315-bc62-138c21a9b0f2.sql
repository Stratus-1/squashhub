INSERT INTO league_associations (club_id, name, abbreviation, platform_association_id, scope, fee_annual, active)
SELECT c.id, 'Northern Squash Association', 'NSA', 'b1cb8b56-bc97-4f31-a8ea-69fab4fc6259', 'region', 0, true
FROM clubs c
WHERE c.tenant_type = 'nsa_seeded'
  AND NOT EXISTS (
    SELECT 1 FROM league_associations la
    WHERE la.club_id = c.id
      AND la.platform_association_id = 'b1cb8b56-bc97-4f31-a8ea-69fab4fc6259'
  );

DO $$
DECLARE
  cor_id uuid := '6486352a-9229-43e7-aa71-dfbaa18abfa7';
  cor_league_ids uuid[];
  cor_member_ids uuid[];
  cor_fixture_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO cor_league_ids FROM leagues WHERE club_id = cor_id;
  SELECT array_agg(id) INTO cor_member_ids FROM club_members WHERE club_id = cor_id;

  DELETE FROM league_week_unavailability WHERE club_id = cor_id;
  DELETE FROM league_week_player_status WHERE club_id = cor_id;
  DELETE FROM league_week_lineups WHERE club_id = cor_id;

  IF cor_league_ids IS NOT NULL THEN
    SELECT array_agg(DISTINCT fixture_id) INTO cor_fixture_ids FROM league_fixture_lineups WHERE league_id = ANY(cor_league_ids);
    DELETE FROM league_fixture_lineups WHERE league_id = ANY(cor_league_ids);
    IF cor_fixture_ids IS NOT NULL THEN
      DELETE FROM league_match_results WHERE fixture_id = ANY(cor_fixture_ids);
      DELETE FROM league_fixture_results WHERE fixture_id = ANY(cor_fixture_ids);
    END IF;
    DELETE FROM member_league_registrations WHERE league_id = ANY(cor_league_ids);
    DELETE FROM leagues WHERE id = ANY(cor_league_ids);
  END IF;

  IF cor_member_ids IS NOT NULL THEN
    DELETE FROM member_association_affiliations WHERE club_member_id = ANY(cor_member_ids);
    DELETE FROM club_members WHERE id = ANY(cor_member_ids);
  END IF;
END $$;