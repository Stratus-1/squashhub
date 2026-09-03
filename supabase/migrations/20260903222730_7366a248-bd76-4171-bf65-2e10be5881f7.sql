CREATE OR REPLACE FUNCTION public.bar_counter_status(_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_dev public.bar_counter_devices; v_sessions int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bar_staff_can_serve(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  SELECT * INTO v_dev FROM public.bar_counter_devices WHERE club_id = _club_id AND active LIMIT 1;
  SELECT count(*) INTO v_sessions FROM public.bar_counter_sessions
   WHERE club_id = _club_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now());
  RETURN jsonb_build_object(
    'has_pin', v_dev.id IS NOT NULL,
    'label', v_dev.label,
    'pin_updated_at', v_dev.updated_at,
    'unlocked_devices', COALESCE(v_sessions,0)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.bar_counter_status(uuid) TO authenticated;