-- 1. Make set_default_ladder_rank SECURITY DEFINER so the MAX() inside the
--    trigger sees ALL existing rows (RLS would otherwise hide them from a
--    self-registering user, causing the new member to land at position 1).
CREATE OR REPLACE FUNCTION public.set_default_ladder_rank()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_group text;
  v_max integer;
BEGIN
  IF NEW.ladder_position IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_group := CASE
    WHEN lower(COALESCE(NEW.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
    ELSE 'men'
  END;

  SELECT COALESCE(MAX(cm.ladder_position), 0)
  INTO v_max
  FROM public.club_members cm
  WHERE cm.club_id = NEW.club_id
    AND cm.id IS DISTINCT FROM NEW.id
    AND cm.ladder_position IS NOT NULL
    AND (
      (v_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
      OR
      (v_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
    );

  NEW.ladder_position := v_max + 1;
  RETURN NEW;
END;
$function$;

-- 2. Repair any members that were wrongly stamped at position 1 (or any other
--    duplicate top position) because of the old behaviour. We only move
--    members whose joined_at is within the last 30 days AND who share their
--    current position with an older member of the same gender group.
WITH ranked AS (
  SELECT
    cm.id,
    cm.club_id,
    cm.gender,
    cm.ladder_position,
    cm.joined_at,
    ROW_NUMBER() OVER (
      PARTITION BY
        cm.club_id,
        cm.ladder_position,
        CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END
      ORDER BY cm.joined_at ASC
    ) AS rn
  FROM public.club_members cm
  WHERE cm.ladder_position IS NOT NULL
),
victims AS (
  SELECT id, club_id, gender
  FROM ranked
  WHERE rn > 1
    AND joined_at > now() - interval '60 days'
),
new_pos AS (
  SELECT
    v.id,
    v.club_id,
    v.gender,
    (
      SELECT COALESCE(MAX(cm2.ladder_position), 0) + ROW_NUMBER() OVER (
        PARTITION BY
          v.club_id,
          CASE WHEN lower(COALESCE(v.gender, '')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END
        ORDER BY v.id
      )
      FROM public.club_members cm2
      WHERE cm2.club_id = v.club_id
        AND cm2.ladder_position IS NOT NULL
        AND cm2.id NOT IN (SELECT id FROM victims)
        AND (
          (lower(COALESCE(v.gender,'')) IN ('female','ladies','f')
              AND lower(COALESCE(cm2.gender,'')) IN ('female','ladies','f'))
          OR
          (lower(COALESCE(v.gender,'')) NOT IN ('female','ladies','f')
              AND lower(COALESCE(cm2.gender,'')) NOT IN ('female','ladies','f'))
        )
    ) AS new_position
  FROM victims v
)
UPDATE public.club_members cm
SET ladder_position = np.new_position
FROM new_pos np
WHERE cm.id = np.id;