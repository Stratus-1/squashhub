DO $$
DECLARE c uuid:='e85d7bd1-3a70-43ee-aa75-e984bb1518f9'; o uuid:='b02444d7-53ef-4e69-a9d6-de0a8ddda1c3'; n uuid:='23493cc7-7aa3-47ce-a700-245e89069c99';
BEGIN
  UPDATE club_champs_registrations SET club_member_id=n, updated_at=now() WHERE champ_id=c AND club_member_id=o;
  UPDATE club_champs_registrations SET partner_member_id=n WHERE champ_id=c AND partner_member_id=o;
  UPDATE champ_doubles_pairs SET member_a=CASE WHEN member_a=o THEN n ELSE member_a END, member_b=CASE WHEN member_b=o THEN n ELSE member_b END, updated_at=now() WHERE champ_id=c AND o IN (member_a,member_b);
  UPDATE club_champs_matches SET
    player_a_member_id=CASE WHEN player_a_member_id=o THEN n ELSE player_a_member_id END,
    partner_a_member_id=CASE WHEN partner_a_member_id=o THEN n ELSE partner_a_member_id END,
    player_b_member_id=CASE WHEN player_b_member_id=o THEN n ELSE player_b_member_id END,
    partner_b_member_id=CASE WHEN partner_b_member_id=o THEN n ELSE partner_b_member_id END
  WHERE champ_id=c AND winner_member_id IS NULL AND o IN (player_a_member_id,partner_a_member_id,player_b_member_id,partner_b_member_id);
END $$;