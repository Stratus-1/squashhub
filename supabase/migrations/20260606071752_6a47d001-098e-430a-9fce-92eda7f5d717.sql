UPDATE public.club_champs_matches
SET status = 'in_progress'
WHERE champ_id = 'edea1025-f030-4391-adf6-16e0302f87ad'
  AND status = 'scheduled'
  AND (side_a_points > 0 OR side_b_points > 0 OR bell_ends_at IS NOT NULL OR bell_paused_seconds IS NOT NULL);