-- Add mixed_ladder_enabled flag on clubs
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS mixed_ladder_enabled boolean NOT NULL DEFAULT false;

-- Update admin_reorder_ladder to support 'mixed' gender_filter (no gender restriction)
CREATE OR REPLACE FUNCTION public.admin_reorder_ladder(player_ids uuid[], gender_filter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i integer;
  pid uuid;
  target_club_id uuid;
  target_group text;
BEGIN
  IF array_length(player_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  target_group := CASE
    WHEN lower(COALESCE(gender_filter, '')) IN ('mixed', 'all', 'combined') THEN 'mixed'
    WHEN lower(COALESCE(gender_filter, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
    ELSE 'men'
  END;

  SELECT cm.club_id
  INTO target_club_id
  FROM public.club_members cm
  WHERE (cm.user_id = player_ids[1] OR cm.id = player_ids[1])
  LIMIT 1;

  IF target_club_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve target club for ladder reorder';
  END IF;

  IF NOT has_role(auth.uid(), 'admin') AND NOT is_club_admin(auth.uid(), target_club_id) THEN
    RAISE EXCEPTION 'Only admins can reorder the ladder';
  END IF;

  FOR i IN 1..array_length(player_ids, 1) LOOP
    pid := player_ids[i];

    UPDATE public.club_members cm
    SET ladder_position = i,
        updated_at = now()
    WHERE (cm.user_id = pid OR cm.id = pid)
      AND cm.club_id = target_club_id
      AND (
        target_group = 'mixed'
        OR (target_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
        OR (target_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
      );
  END LOOP;
END;
$function$;