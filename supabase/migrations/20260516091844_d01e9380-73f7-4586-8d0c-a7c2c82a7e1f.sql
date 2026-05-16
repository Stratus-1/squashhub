CREATE OR REPLACE FUNCTION public.next_bottom_ladder_position(_club_id uuid, _gender text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_group text;
  v_max integer;
BEGIN
  v_group := CASE
    WHEN lower(COALESCE(_gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
    ELSE 'men'
  END;

  SELECT COALESCE(MAX(cm.ladder_position), 0)
  INTO v_max
  FROM public.club_members cm
  WHERE cm.club_id = _club_id
    AND cm.ladder_position IS NOT NULL
    AND (
      (v_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
      OR
      (v_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
    );

  RETURN v_max + 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_bottom_ladder_position(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_bottom_ladder_position(uuid, text) TO authenticated;