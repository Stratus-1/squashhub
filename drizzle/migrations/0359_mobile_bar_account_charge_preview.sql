CREATE OR REPLACE FUNCTION public.bar_account_charge_preview(_club_member_id uuid, _sync_secret text)
RETURNS TABLE(bar_gated boolean, shop_gated boolean, current_owing numeric, allowance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_club uuid; v_user uuid; v_status text; g record;
BEGIN
  SELECT club_id, user_id, status::text INTO v_club, v_user, v_status
    FROM public.club_members WHERE id = _club_member_id;
  IF v_club IS NULL THEN RETURN; END IF;
  IF _sync_secret IS NOT NULL THEN
    IF public.mobile_internal_secret_ok(_sync_secret) IS NOT TRUE OR v_status <> 'active' OR v_user IS NULL THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF (v_user = auth.uid()
        OR public.is_club_admin_or_permitted(auth.uid(), v_club, 'bar')
        OR public.bar_staff_can_serve(auth.uid(), v_club)) IS NOT TRUE THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT NOT COALESCE(s.bar_allow_member_debit, true), NOT COALESCE(s.shop_allow_member_debit, true)
    INTO bar_gated, shop_gated FROM public.club_bar_settings s WHERE s.club_id = v_club;
  bar_gated := COALESCE(bar_gated, false);
  shop_gated := COALESCE(shop_gated, false);
  SELECT * INTO g FROM public.member_account_gate(_club_member_id, 0);
  current_owing := g.current_owing;
  allowance := g.allowance;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.bar_account_charge_preview(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bar_account_charge_preview(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.bar_account_charge_preview(_club_member_id uuid)
RETURNS TABLE(bar_gated boolean, shop_gated boolean, current_owing numeric, allowance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT * FROM public.bar_account_charge_preview(_club_member_id, NULL::text);
$$;
REVOKE ALL ON FUNCTION public.bar_account_charge_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_account_charge_preview(uuid) TO authenticated, service_role;