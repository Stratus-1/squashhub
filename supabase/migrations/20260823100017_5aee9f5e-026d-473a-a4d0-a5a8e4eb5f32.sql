CREATE OR REPLACE FUNCTION public.set_club_subscription_baseline_cycle(_club_id uuid, _cycle text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle text;
BEGIN
  IF _cycle NOT IN ('monthly','biannual','annual') THEN
    RAISE EXCEPTION 'Invalid billing cycle: %', _cycle;
  END IF;

  IF NOT public.is_club_admin(_club_id) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  v_cycle := _cycle;

  UPDATE public.club_subscription_baselines b
     SET billing_cycle = v_cycle
   WHERE b.id = (
     SELECT id FROM public.club_subscription_baselines
      WHERE club_id = _club_id
      ORDER BY created_at DESC
      LIMIT 1
   );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_club_subscription_baseline_cycle(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_club_subscription_baseline_cycle(uuid, text) TO service_role;