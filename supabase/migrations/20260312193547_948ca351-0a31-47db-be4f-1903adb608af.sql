
CREATE OR REPLACE FUNCTION public.admin_reorder_ladder(player_ids uuid[], gender_filter text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  i integer;
  pid uuid;
  club_member_record record;
BEGIN
  -- Verify caller is admin
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reorder the ladder';
  END IF;

  -- Update league_player_rank on club_members for each player in order
  FOR i IN 1..array_length(player_ids, 1) LOOP
    pid := player_ids[i];
    
    -- Find the club_member record (by user_id or by id directly)
    SELECT id INTO club_member_record
    FROM public.club_members
    WHERE (user_id = pid OR id = pid)
    LIMIT 1;

    IF club_member_record.id IS NOT NULL THEN
      -- Update all league registrations for this member with new rank
      UPDATE public.member_league_registrations
      SET player_rank = i, updated_at = now()
      WHERE club_member_id = club_member_record.id;
      
      -- Also update the profiles rank if user_id exists
      UPDATE public.profiles
      SET rank = i, updated_at = now()
      WHERE id = pid;
    END IF;
  END LOOP;
END;
$function$;
