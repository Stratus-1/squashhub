CREATE OR REPLACE FUNCTION public.set_default_ladder_rank()
RETURNS trigger
LANGUAGE plpgsql
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

  -- Always place new members at the bottom of the ladder, ignoring skill level.
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