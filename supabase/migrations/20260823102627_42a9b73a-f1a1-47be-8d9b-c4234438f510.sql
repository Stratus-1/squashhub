CREATE OR REPLACE FUNCTION public.set_club_billing_frequency(
  _club_id uuid,
  _billing_option text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle text;
  v_previous text;
BEGIN
  IF _billing_option NOT IN ('monthly', 'biannual_upfront', 'annual_upfront') THEN
    RAISE EXCEPTION 'Invalid billing option: %', _billing_option;
  END IF;

  IF NOT (
    public.is_club_admin_or_permitted(auth.uid(), _club_id, 'finance')
    OR public.is_club_admin_or_permitted(auth.uid(), _club_id, 'club')
    OR public.is_platform_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorised to change billing frequency for this club';
  END IF;

  v_cycle := CASE _billing_option
    WHEN 'annual_upfront' THEN 'annual'
    WHEN 'biannual_upfront' THEN 'biannual'
    ELSE 'monthly'
  END;

  SELECT sla_billing_option
    INTO v_previous
    FROM public.clubs
   WHERE id = _club_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found';
  END IF;

  UPDATE public.clubs
     SET sla_billing_option = _billing_option,
         baseline_cycle = v_cycle
   WHERE id = _club_id;

  UPDATE public.club_subscription_baselines b
     SET billing_cycle = v_cycle
   WHERE b.id = (
     SELECT id
       FROM public.club_subscription_baselines
      WHERE club_id = _club_id
      ORDER BY created_at DESC
      LIMIT 1
   );

  IF v_previous IS DISTINCT FROM _billing_option THEN
    INSERT INTO public.club_billing_audit
      (club_id, field, old_value, new_value, changed_by)
    VALUES
      (_club_id, 'sla_billing_option', v_previous, _billing_option, auth.uid());
  END IF;

  RETURN _billing_option;
END;
$$;

REVOKE ALL ON FUNCTION public.set_club_billing_frequency(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_club_billing_frequency(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_club_billing_frequency(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_club_billing_frequency(uuid, text) TO service_role;