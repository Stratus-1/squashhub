
CREATE OR REPLACE FUNCTION public.set_default_ladder_rank()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group text;
  v_skill_order integer;
  v_insert_after integer;
  v_next_rank integer;
BEGIN
  IF NEW.league_player_rank IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_group := CASE
    WHEN lower(COALESCE(NEW.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
    ELSE 'men'
  END;

  -- Map skill level to an order (lower = stronger)
  v_skill_order := CASE COALESCE(NEW.skill_level, '')
    WHEN 'elite' THEN 1
    WHEN 'league_player' THEN 2
    WHEN 'club_player' THEN 3
    WHEN 'social_player' THEN 4
    WHEN 'beginner' THEN 5
    -- Legacy values mapped
    WHEN 'very_high' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium_high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'medium_low' THEN 4
    WHEN 'low' THEN 4
    WHEN 'starter' THEN 5
    ELSE 5  -- Default: bottom tier
  END;

  -- Find the last rank of players at the same skill tier or better
  SELECT COALESCE(MAX(cm.league_player_rank), 0)
  INTO v_insert_after
  FROM public.club_members cm
  WHERE cm.club_id = NEW.club_id
    AND cm.id IS DISTINCT FROM NEW.id
    AND (
      (v_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
      OR
      (v_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
    )
    AND cm.league_player_rank IS NOT NULL
    AND (
      CASE COALESCE(cm.skill_level, '')
        WHEN 'elite' THEN 1
        WHEN 'league_player' THEN 2
        WHEN 'club_player' THEN 3
        WHEN 'social_player' THEN 4
        WHEN 'beginner' THEN 5
        WHEN 'very_high' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium_high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'medium_low' THEN 4
        WHEN 'low' THEN 4
        WHEN 'starter' THEN 5
        ELSE 5
      END
    ) <= v_skill_order;

  v_next_rank := v_insert_after + 1;

  -- Shift everyone below down by 1
  UPDATE public.club_members cm
  SET league_player_rank = cm.league_player_rank + 1,
      updated_at = now()
  WHERE cm.club_id = NEW.club_id
    AND cm.id IS DISTINCT FROM NEW.id
    AND (
      (v_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
      OR
      (v_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
    )
    AND cm.league_player_rank IS NOT NULL
    AND cm.league_player_rank >= v_next_rank;

  NEW.league_player_rank := v_next_rank;
  RETURN NEW;
END;
$function$;
