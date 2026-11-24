CREATE OR REPLACE FUNCTION public.open_my_bar_tab(_club_id uuid, _club_member_id uuid, _sync_secret text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  m public.club_members%ROWTYPE;
  t public.bar_guest_tabs%ROWTYPE;
  v_code text;
BEGIN
  IF _sync_secret IS NOT NULL THEN
    IF NOT public.mobile_internal_secret_ok(_sync_secret) THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
    END IF;
    SELECT * INTO m FROM public.club_members
     WHERE id = _club_member_id AND club_id = _club_id AND status = 'active' FOR UPDATE;
  ELSE
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Sign in to open your tab' USING ERRCODE='42501';
    END IF;
    SELECT * INTO m FROM public.club_members
     WHERE id = _club_member_id AND club_id = _club_id
       AND user_id = auth.uid() AND status = 'active' FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This membership is not yours or is not active' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = _club_id AND COALESCE(honesty_bar_enabled, false)) THEN
    RAISE EXCEPTION 'The bar is not available';
  END IF;
  SELECT code INTO v_code FROM public.qr_short_codes
   WHERE club_id = _club_id AND active AND bar_item_id IS NULL ORDER BY created_at LIMIT 1;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'The club menu QR code is not set up';
  END IF;

  -- Reuse any open tab of this member (counter-opened or self-opened), oldest first
  SELECT * INTO t FROM public.bar_guest_tabs
   WHERE club_id = _club_id AND club_member_id = m.id AND status IN ('open','closing')
   ORDER BY opened_at ASC LIMIT 1;
  IF NOT FOUND THEN
    IF NULLIF(btrim(m.name), '') IS NULL THEN
      RAISE EXCEPTION 'Your member name is missing';
    END IF;
    INSERT INTO public.bar_guest_tabs (club_id, club_member_id, guest_name, guest_phone, opened_source)
    VALUES (_club_id, m.id, btrim(m.name), m.phone, 'in_app') RETURNING * INTO t;
  END IF;

  RETURN jsonb_build_object('tab_id', t.id, 'token', t.token, 'guest_name', t.guest_name, 'status', t.status, 'code', v_code);
END;
$function$;