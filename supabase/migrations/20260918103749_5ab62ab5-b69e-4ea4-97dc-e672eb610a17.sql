CREATE OR REPLACE FUNCTION public.admin_set_cross_gender_ladder(
  p_club_id uuid,
  p_member_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  i integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') AND NOT is_club_admin(auth.uid(), p_club_id) THEN
    RAISE EXCEPTION 'Only admins can reorder the ladder';
  END IF;

  -- Clear positions that are no longer cross-listed in this club.
  UPDATE public.club_members
  SET cross_gender_ladder_position = NULL,
      updated_at = now()
  WHERE club_id = p_club_id
    AND cross_gender_ladder_position IS NOT NULL
    AND (p_member_ids IS NULL OR NOT (id = ANY(p_member_ids)));

  IF p_member_ids IS NULL OR array_length(p_member_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOR i IN 1..array_length(p_member_ids, 1) LOOP
    UPDATE public.club_members
    SET cross_gender_ladder_position = i,
        updated_at = now()
    WHERE id = p_member_ids[i]
      AND club_id = p_club_id;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_cross_gender_ladder(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_cross_gender_ladder(uuid, uuid[]) TO authenticated;