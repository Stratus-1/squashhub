ALTER TABLE public.bar_guest_tabs ADD COLUMN IF NOT EXISTS guest_phone text;

CREATE OR REPLACE FUNCTION public.open_bar_guest_tab(_code text, _guest_name text, _guest_phone text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_member uuid; v_id uuid; v_token uuid;
BEGIN
  SELECT club_id INTO v_club FROM public.qr_short_codes WHERE code = _code AND active = true;
  IF v_club IS NULL THEN RAISE EXCEPTION 'This bar code is no longer active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = v_club AND COALESCE(honesty_bar_enabled,false)) THEN
    RAISE EXCEPTION 'The bar is not open for orders';
  END IF;
  IF btrim(COALESCE(_guest_name,'')) = '' THEN RAISE EXCEPTION 'Please give a name for the tab'; END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_member FROM public.club_members
     WHERE club_id = v_club AND user_id = auth.uid() LIMIT 1;
  END IF;

  INSERT INTO public.bar_guest_tabs (club_id, guest_name, guest_phone, club_member_id)
  VALUES (v_club, btrim(_guest_name), NULLIF(btrim(COALESCE(_guest_phone,'')),''), v_member)
  RETURNING id, token INTO v_id, v_token;

  RETURN jsonb_build_object('tab_id', v_id, 'token', v_token, 'guest_name', btrim(_guest_name));
END; $function$;