update member_association_affiliations
set league_association_number = 'NSF6350', updated_at = now()
where club_member_id = '40128d00-4505-40ca-b9a4-655ce900d9ef'
  and league_association_number is null;

update league_match_results r
set home_player_member_id = '40128d00-4505-40ca-b9a4-655ce900d9ef', updated_at = now()
from platform_league_fixtures f
where r.fixture_id = f.id
  and r.home_player_code = 'NSF6350'
  and r.home_player_member_id is null
  and f.fixture_date >= '2026-01-01';