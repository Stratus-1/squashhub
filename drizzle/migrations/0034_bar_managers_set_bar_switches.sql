CREATE OR REPLACE FUNCTION public.set_club_bar_switch(_club_id uuid, _key text, _value boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'You do not have bar management rights at this club' USING ERRCODE = '42501';
  END IF;
  IF _key = 'honesty_bar_enabled' THEN UPDATE clubs SET honesty_bar_enabled = _value WHERE id = _club_id;
  ELSIF _key = 'bar_account_tab_enabled' THEN UPDATE clubs SET bar_account_tab_enabled = _value WHERE id = _club_id;
  ELSIF _key = 'bar_pay_online_enabled' THEN UPDATE clubs SET bar_pay_online_enabled = _value WHERE id = _club_id;
  ELSIF _key = 'bar_card_swipe_enabled' THEN UPDATE clubs SET bar_card_swipe_enabled = _value WHERE id = _club_id;
  ELSIF _key = 'bar_cash_enabled' THEN UPDATE clubs SET bar_cash_enabled = _value WHERE id = _club_id;
  ELSE RAISE EXCEPTION 'Unsupported bar setting %', _key;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_club_bar_switch(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_club_bar_switch(uuid, text, boolean) TO authenticated;