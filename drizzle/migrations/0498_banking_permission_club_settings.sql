-- 1. Billing frequency: accept the banking slug alongside finance/club
CREATE OR REPLACE FUNCTION public.set_club_billing_frequency(_club_id uuid, _billing_option text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    OR public.is_club_admin_or_permitted(auth.uid(), _club_id, 'banking')
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
$function$;

-- 2. Billing profile RLS: banking holders may insert/update
DROP POLICY IF EXISTS "Club finance can insert billing profile" ON public.club_billing_profiles;
CREATE POLICY "Club finance can insert billing profile" ON public.club_billing_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance')
    OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking')
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Club finance can update billing profile" ON public.club_billing_profiles;
CREATE POLICY "Club finance can update billing profile" ON public.club_billing_profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance')
    OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking')
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance')
    OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking')
    OR public.is_platform_admin(auth.uid())
  );

-- 3. Club feature switches (club_capabilities): banking holders may manage
DROP POLICY IF EXISTS "Club admins manage capabilities" ON public.club_capabilities;
CREATE POLICY "Club admins manage capabilities" ON public.club_capabilities
  FOR ALL TO authenticated
  USING (
    public.is_club_admin(auth.uid(), club_id)
    OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.is_club_admin(auth.uid(), club_id)
    OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking')
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );