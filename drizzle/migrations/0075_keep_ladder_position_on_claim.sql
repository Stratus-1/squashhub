CREATE OR REPLACE FUNCTION public.force_ladder_bottom_on_claim()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group text;
  v_max integer;
BEGIN
  -- Only act when an unclaimed row is claimed AND it has no ladder rank yet.
  -- Existing (imported) members keep their current position.
  IF OLD.user_id IS NOT NULL OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.ladder_position IS NOT NULL THEN
    NEW.ladder_position := OLD.ladder_position;
    RETURN NEW;
  END IF;
  IF NEW.ladder_position IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_group := CASE WHEN lower(COALESCE(NEW.gender, '')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END;

  SELECT COALESCE(MAX(cm.ladder_position), 0) INTO v_max
  FROM public.club_members cm
  WHERE cm.club_id = NEW.club_id
    AND cm.id IS DISTINCT FROM NEW.id
    AND cm.ladder_position IS NOT NULL
    AND ((v_group = 'ladies' AND lower(COALESCE(cm.gender,'')) IN ('female','ladies','f'))
      OR (v_group = 'men' AND lower(COALESCE(cm.gender,'')) NOT IN ('female','ladies','f')));

  NEW.ladder_position := v_max + 1;
  RETURN NEW;
END;
$$;