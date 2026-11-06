CREATE OR REPLACE FUNCTION public.set_club_sla_payment_method(_club_id uuid, _method text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev text;
BEGIN
  IF _method NOT IN ('eft','card') THEN RAISE EXCEPTION 'Invalid payment method: %', _method; END IF;
  IF NOT (public.is_club_admin_or_permitted(auth.uid(), _club_id, 'finance')
       OR public.is_club_admin_or_permitted(auth.uid(), _club_id, 'club')
       OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised to change the subscription payment method for this club';
  END IF;
  SELECT sla_payment_method INTO v_prev FROM public.clubs WHERE id = _club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club not found'; END IF;
  UPDATE public.clubs SET sla_payment_method = _method WHERE id = _club_id;
  IF v_prev IS DISTINCT FROM _method THEN
    INSERT INTO public.club_billing_audit (club_id, field, old_value, new_value, changed_by)
    VALUES (_club_id, 'sla_payment_method', v_prev, _method, auth.uid());
  END IF;
  RETURN _method;
END $$;
REVOKE ALL ON FUNCTION public.set_club_sla_payment_method(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_club_sla_payment_method(uuid, text) TO authenticated;