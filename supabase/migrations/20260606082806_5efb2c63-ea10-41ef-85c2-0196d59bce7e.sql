UPDATE public.club_champs_matches
SET
  side_a_points = 40,
  side_b_points = 44,
  score = '40-44',
  winner_member_id = 'b1945b7e-ecb8-4c37-bcd7-9f781f37098b',
  status = 'completed',
  bell_ends_at = NULL,
  bell_paused_seconds = NULL,
  updated_at = now()
WHERE id = 'cd115393-cb1f-4060-a136-7d1a9ce144ef'
  AND champ_id = 'edea1025-f030-4391-adf6-16e0302f87ad';