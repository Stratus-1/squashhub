UPDATE public.club_champs_matches
SET status='scheduled', side_a_points=NULL, side_b_points=NULL,
    winner_member_id=NULL, score=NULL, game_scores=NULL,
    bell_ends_at=NULL, bell_paused_seconds=NULL
WHERE id='e7c5bd17-6fe4-4aef-b43a-1429ec675ed4';

DELETE FROM public.matches
WHERE id IN (
  SELECT id FROM public.matches WHERE notes ILIKE '%e7c5bd17-6fe4-4aef-b43a-1429ec675ed4%'
);