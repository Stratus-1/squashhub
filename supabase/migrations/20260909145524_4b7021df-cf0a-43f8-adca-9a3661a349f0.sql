WITH cand AS (
  SELECT m.id,
         (SELECT cm.id FROM public.club_members cm
           WHERE cm.club_id = m.club_id
             AND lower(regexp_replace(cm.name, '\s+', ' ', 'g')) = lower(regexp_replace(m.external_opponent_name, '\s+', ' ', 'g'))
           LIMIT 2) AS member_id,
         (SELECT count(*) FROM public.club_members cm
           WHERE cm.club_id = m.club_id
             AND lower(regexp_replace(cm.name, '\s+', ' ', 'g')) = lower(regexp_replace(m.external_opponent_name, '\s+', ' ', 'g'))) AS n
  FROM public.matches m
  WHERE m.is_imported IS TRUE
    AND m.player_b_member_id IS NULL
    AND m.external_opponent_name IS NOT NULL
)
UPDATE public.matches m
SET player_b_member_id = c.member_id,
    winner_member_id = CASE WHEN m.winner_member_id IS NULL THEN c.member_id ELSE m.winner_member_id END,
    external_opponent_name = NULL
FROM cand c
WHERE c.id = m.id AND c.n = 1 AND c.member_id IS NOT NULL;