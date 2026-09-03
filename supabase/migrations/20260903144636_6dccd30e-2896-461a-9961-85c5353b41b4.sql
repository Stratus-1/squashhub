CREATE OR REPLACE FUNCTION public.bar_resolve_member_by_number(_club_id uuid, _number text)
RETURNS TABLE (id uuid, name text, club_member_number text, has_pin boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num text := upper(regexp_replace(coalesce(_number, ''), '\s', '', 'g'));
BEGIN
  IF NOT public.bar_staff_can_serve(_club_id) THEN
    RAISE EXCEPTION 'Not authorised to operate the bar for this club';
  END IF;
  IF length(v_num) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cm.id,
         cm.name,
         cm.club_member_number,
         EXISTS (SELECT 1 FROM public.member_bar_pins p WHERE p.club_member_id = cm.id) AS has_pin
  FROM public.club_members cm
  WHERE cm.club_id = _club_id
    AND cm.status = 'active'
    AND upper(regexp_replace(coalesce(cm.club_member_number, ''), '\s', '', 'g')) = v_num
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.bar_resolve_member_by_number(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.bar_resolve_member_by_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bar_resolve_member_by_number(uuid, text) TO service_role;