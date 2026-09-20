-- A section's last game is only a semi-final while another section of the same
-- league is still running: the two section winners must still meet.
UPDATE public.club_champs_matches m
SET stage_label = regexp_replace(m.stage_label, '(·\s*)Finals?$', '\1Semi-final'),
    play_by = CASE WHEN m.status <> 'completed' THEN DATE '2026-09-20' ELSE m.play_by END,
    updated_at = now()
WHERE m.champ_id = '8c405b3f-1b90-4a22-9d8a-54856ec21c33'
  AND m.stage_label ~* '^Section .+·\s*Finals?$'
  AND m.stage_label !~* 'league final';