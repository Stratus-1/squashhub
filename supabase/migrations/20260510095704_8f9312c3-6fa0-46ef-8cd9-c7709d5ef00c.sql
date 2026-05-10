-- Guard trigger: block bulk ladder reshuffles unless explicitly flagged
CREATE OR REPLACE FUNCTION public.guard_bulk_ladder_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
  v_count int;
BEGIN
  -- Count how many rows in this statement actually changed ladder_position
  SELECT count(*) INTO v_count
  FROM new_table n
  JOIN old_table o ON o.id = n.id
  WHERE n.ladder_position IS DISTINCT FROM o.ladder_position;

  IF v_count <= 5 THEN
    RETURN NULL;
  END IF;

  -- Bulk change — require explicit allow flag
  BEGIN
    v_source := current_setting('app.ladder_change_source', true);
  EXCEPTION WHEN OTHERS THEN
    v_source := NULL;
  END;

  IF v_source IN ('admin_reorder', 'nsc_restore', 'challenge_swap', 'admin_allocate') THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'Bulk ladder change blocked: % rows changed without app.ladder_change_source flag. Set it to admin_reorder/admin_allocate/challenge_swap/nsc_restore to allow.', v_count;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_bulk_ladder_changes ON public.club_members;
CREATE TRIGGER trg_guard_bulk_ladder_changes
AFTER UPDATE ON public.club_members
REFERENCING OLD TABLE AS old_table NEW TABLE AS new_table
FOR EACH STATEMENT
EXECUTE FUNCTION public.guard_bulk_ladder_changes();