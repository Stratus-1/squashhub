-- Force every newly registered/claimed club member to the BOTTOM of the ladder
-- (within their gender group), regardless of skill_level. They must climb via challenges.

CREATE OR REPLACE FUNCTION public.force_ladder_bottom_on_claim()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_group text;
  v_max integer;
BEGIN
  -- Only act when row is being CLAIMED for the first time:
  --   user_id was NULL and is now being set to a value.
  IF OLD.user_id IS NOT NULL OR NEW.user_id IS NULL THEN
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
$$;

DROP TRIGGER IF EXISTS trg_force_ladder_bottom_on_claim ON public.club_members;
CREATE TRIGGER trg_force_ladder_bottom_on_claim
BEFORE UPDATE OF user_id ON public.club_members
FOR EACH ROW
EXECUTE FUNCTION public.force_ladder_bottom_on_claim();