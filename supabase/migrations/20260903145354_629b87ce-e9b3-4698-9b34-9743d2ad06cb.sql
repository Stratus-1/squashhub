CREATE OR REPLACE FUNCTION public.bar_resolve_member_by_number(_club_id uuid, _number text)
RETURNS TABLE (id uuid, name text, club_member_number text, has_pin boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text := upper(regexp_replace(coalesce(_number, ''), '\s', '', 'g'));
  v_digits text := regexp_replace(coalesce(_number, ''), '\D', '', 'g');
BEGIN
  IF NOT public.bar_staff_can_serve(_club_id) THEN
    RAISE EXCEPTION 'Not authorised to operate the bar for this club';
  END IF;
  IF length(v_raw) < 1 THEN
    RETURN;
  END IF;

  IF v_raw ~ '^[0-9]+$' AND length(v_digits) >= 1 THEN
    RETURN QUERY
    SELECT cm.id, cm.name, cm.club_member_number,
           EXISTS (SELECT 1 FROM public.member_bar_pins p WHERE p.club_member_id = cm.id) AS has_pin
    FROM public.club_members cm
    WHERE cm.club_id = _club_id
      AND cm.status = 'active'
      AND regexp_replace(coalesce(cm.club_member_number, ''), '\D', '', 'g') <> ''
      AND (regexp_replace(cm.club_member_number, '\D', '', 'g'))::bigint = v_digits::bigint
    ORDER BY cm.club_member_number
    LIMIT 1;
    RETURN;
  END IF;

  IF length(v_raw) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cm.id, cm.name, cm.club_member_number,
         EXISTS (SELECT 1 FROM public.member_bar_pins p WHERE p.club_member_id = cm.id) AS has_pin
  FROM public.club_members cm
  WHERE cm.club_id = _club_id
    AND cm.status = 'active'
    AND upper(regexp_replace(coalesce(cm.club_member_number, ''), '\s', '', 'g')) = v_raw
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.bar_resolve_member_by_number(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.bar_resolve_member_by_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bar_resolve_member_by_number(uuid, text) TO service_role;