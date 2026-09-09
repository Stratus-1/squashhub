CREATE OR REPLACE FUNCTION public.guard_bulk_ladder_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source text;
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM new_table n
  JOIN old_table o ON o.id = n.id
  WHERE n.ladder_position IS DISTINCT FROM o.ladder_position;

  IF v_count <= 5 THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_source := current_setting('app.ladder_change_source', true);
  EXCEPTION WHEN OTHERS THEN
    v_source := NULL;
  END;

  IF v_source IN ('admin_reorder', 'nsc_restore', 'challenge_swap', 'admin_allocate', 'league_internal_apply', 'ladder_move_apply') THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'Bulk ladder change blocked: % rows changed without app.ladder_change_source flag. Set it to admin_reorder/admin_allocate/challenge_swap/nsc_restore/league_internal_apply/ladder_move_apply to allow.', v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ladder_move_apply_now(_club_id uuid, _winner_member_id uuid, _loser_member_id uuid, _movement text DEFAULT 'insert'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w_rank integer; l_rank integer;
  w_group text; l_group text;
  v_prev_source text;
  v_move text := CASE WHEN lower(COALESCE(_movement,'')) = 'swap' THEN 'swap' ELSE 'insert' END;
BEGIN
  IF _club_id IS NULL OR _winner_member_id IS NULL OR _loser_member_id IS NULL
     OR _winner_member_id = _loser_member_id THEN
    RETURN false;
  END IF;

  IF NOT public.is_rankable_member(_winner_member_id)
     OR NOT public.is_rankable_member(_loser_member_id) THEN
    RETURN false;
  END IF;

  SELECT cm.ladder_position,
         CASE WHEN lower(COALESCE(cm.gender,'')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END
    INTO w_rank, w_group
  FROM public.club_members cm WHERE cm.id = _winner_member_id AND cm.club_id = _club_id;

  SELECT cm.ladder_position,
         CASE WHEN lower(COALESCE(cm.gender,'')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END
    INTO l_rank, l_group
  FROM public.club_members cm WHERE cm.id = _loser_member_id AND cm.club_id = _club_id;

  IF w_rank IS NULL OR l_rank IS NULL THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clubs c WHERE c.id = _club_id AND COALESCE(c.mixed_ladder_enabled,false) IS TRUE
  ) AND w_group IS DISTINCT FROM l_group THEN
    RETURN false;
  END IF;

  IF w_rank <= l_rank THEN RETURN false; END IF;

  -- A single result can legitimately shift every player between the two ranks
  -- down by one. Flag this cascade so the bulk-ladder guard allows it, then
  -- restore whatever the caller had set.
  v_prev_source := current_setting('app.ladder_change_source', true);
  PERFORM set_config('app.ladder_change_source', 'ladder_move_apply', true);

  IF v_move = 'swap' THEN
    UPDATE public.club_members SET ladder_position = l_rank, updated_at = now() WHERE id = _winner_member_id;
    UPDATE public.club_members SET ladder_position = w_rank, updated_at = now() WHERE id = _loser_member_id;
  ELSE
    UPDATE public.club_members cm
       SET ladder_position = cm.ladder_position + 1, updated_at = now()
     WHERE cm.club_id = _club_id
       AND cm.ladder_position IS NOT NULL
       AND cm.ladder_position >= l_rank
       AND cm.ladder_position < w_rank
       AND cm.id <> _winner_member_id
       AND (
         EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = _club_id AND COALESCE(c.mixed_ladder_enabled,false) IS TRUE)
         OR (CASE WHEN lower(COALESCE(cm.gender,'')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END) = w_group
       );

    UPDATE public.club_members
       SET ladder_position = l_rank, updated_at = now()
     WHERE id = _winner_member_id;
  END IF;

  PERFORM set_config('app.ladder_change_source', COALESCE(v_prev_source, ''), true);

  RETURN true;
END;
$function$;