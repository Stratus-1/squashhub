CREATE OR REPLACE FUNCTION public.bar_account_charge_preview(_club_member_id uuid)
RETURNS TABLE(bar_gated boolean, shop_gated boolean, current_owing numeric, allowance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_club uuid; v_user uuid; g record;
BEGIN
  SELECT club_id, user_id INTO v_club, v_user FROM club_members WHERE id = _club_member_id;
  IF v_club IS NULL THEN RETURN; END IF;
  IF NOT (v_user = auth.uid()
          OR is_club_admin_or_permitted(auth.uid(), v_club, 'bar')
          OR bar_staff_can_serve(auth.uid(), v_club)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT NOT COALESCE(s.bar_allow_member_debit, true), NOT COALESCE(s.shop_allow_member_debit, true)
    INTO bar_gated, shop_gated FROM club_bar_settings s WHERE s.club_id = v_club;
  bar_gated := COALESCE(bar_gated, false);
  shop_gated := COALESCE(shop_gated, false);
  SELECT * INTO g FROM member_account_gate(_club_member_id, 0);
  current_owing := g.current_owing;
  allowance := g.allowance;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.bar_account_charge_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_account_charge_preview(uuid) TO authenticated, service_role;
-- The raw gate is only used inside the enforcement trigger; stop direct balance lookups for arbitrary members.
REVOKE EXECUTE ON FUNCTION public.member_account_gate(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_account_gate(uuid, numeric) TO service_role;