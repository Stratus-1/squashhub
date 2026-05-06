-- Fix Nelspruit Squash Club (NSC) ladder: move recent self-registered members
-- (joined on/after 2026-05-03) to the bottom of the Men's ladder in join order,
-- and re-pack the remaining ladder so positions are contiguous (1..N).
DO $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT id INTO v_club_id FROM public.clubs WHERE subdomain = 'nsc' LIMIT 1;
  IF v_club_id IS NULL THEN
    RAISE NOTICE 'NSC club not found, skipping ladder repair';
    RETURN;
  END IF;

  -- Re-rank Men's ladder for NSC:
  --   * Members who self-registered on/after 2026-05-03 go to the bottom,
  --     ordered by joined_at ASC (earliest claimer = higher of the late group).
  --   * Everyone else keeps their relative order from current ladder_position.
  WITH ranked AS (
    SELECT
      cm.id,
      ROW_NUMBER() OVER (
        ORDER BY
          (cm.user_id IS NOT NULL AND cm.joined_at >= '2026-05-03'::timestamptz)::int ASC,
          cm.ladder_position NULLS LAST,
          cm.joined_at ASC
      ) AS new_pos
    FROM public.club_members cm
    WHERE cm.club_id = v_club_id
      AND cm.gender = 'Men'
      AND cm.ladder_position IS NOT NULL
  )
  UPDATE public.club_members cm
     SET ladder_position = ranked.new_pos
    FROM ranked
   WHERE cm.id = ranked.id;
END$$;