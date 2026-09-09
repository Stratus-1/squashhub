update public.club_champs_matches
set status='scheduled', winner_member_id=null, score=null, game_scores=null,
    side_a_points=null, side_b_points=null, forfeit_member_id=null
where id='0e90c65b-2eb4-468c-8fe3-87d4bf49f434';

delete from public.ranking_points_pending where id='7852693a-4a95-4f4d-9beb-4774737aa9c7';

delete from public.email_outbox
where ref_id='0e90c65b-2eb4-468c-8fe3-87d4bf49f434' and kind='champ_result' and status <> 'sent';