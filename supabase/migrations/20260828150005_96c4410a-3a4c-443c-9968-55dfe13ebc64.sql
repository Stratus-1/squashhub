WITH hist AS (
  SELECT DISTINCT ON (least(m.player_a_member_id,m.player_b_member_id), greatest(m.player_a_member_id,m.player_b_member_id)) m.*
  FROM public.matches m
  WHERE m.club_id='061e6dd9-0ec2-4427-a939-3f18ad0884c8'
    AND m.created_at < '2026-08-28 11:01+00'
    AND m.match_date >= '2026-08-20'
    AND m.notes LIKE 'Marked via live scorer%'
  ORDER BY least(m.player_a_member_id,m.player_b_member_id), greatest(m.player_a_member_id,m.player_b_member_id), m.created_at DESC
)
UPDATE public.club_champs_matches cm
SET status='completed', score=h.score, game_scores=h.game_scores,
    winner_member_id=h.winner_member_id, updated_at=now()
FROM hist h
WHERE cm.champ_id='8c405b3f-1b90-4a22-9d8a-54856ec21c33'
  AND cm.status='scheduled'
  AND cm.player_a_member_id = h.player_a_member_id
  AND cm.player_b_member_id = h.player_b_member_id;