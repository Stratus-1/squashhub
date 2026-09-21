
CREATE OR REPLACE FUNCTION public.booking_visitor_entitled(p_user_id uuid, p_club_id uuid, p_club_member_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member_id uuid;
  v_role text;
BEGIN
  IF p_club_id IS NULL OR p_user_id IS NULL THEN RETURN true; END IF;
  IF public.is_club_admin(p_user_id, p_club_id) OR public.is_platform_admin(p_user_id) THEN RETURN true; END IF;

  v_member_id := p_club_member_id;
  IF v_member_id IS NULL THEN
    SELECT id INTO v_member_id FROM public.club_members
     WHERE club_id = p_club_id AND user_id = p_user_id
     ORDER BY joined_at NULLS LAST LIMIT 1;
  END IF;
  IF v_member_id IS NULL THEN RETURN true; END IF;

  SELECT lower(role::text) INTO v_role FROM public.club_members WHERE id = v_member_id;
  IF v_role IS DISTINCT FROM 'visitor' THEN RETURN true; END IF;

  RETURN public.has_active_visitor_pass(v_member_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.visitor_purchase_pass(p_club_member_id uuid, p_pass_kind text)
RETURNS club_visitor_passes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m record;
  cat record;
  v_pass_id uuid;
  v_fee_id uuid;
  v_label text;
BEGIN
  SELECT cm.id, cm.club_id, cm.user_id, lower(cm.role::text) AS role INTO m
  FROM public.club_members cm WHERE cm.id = p_club_member_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Visitor not found'; END IF;
  IF m.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_club_admin(auth.uid(), m.club_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF m.role <> 'visitor' THEN RAISE EXCEPTION 'Visitor passes apply to visitors only'; END IF;

  SELECT id, name, annual_fee, active INTO cat
  FROM public.member_fee_categories
  WHERE club_id = m.club_id AND visitor_pass_kind = p_pass_kind;

  IF cat.id IS NULL OR cat.active IS NOT TRUE THEN
    RAISE EXCEPTION 'This club does not offer that visitor pass';
  END IF;

  IF EXISTS (SELECT 1 FROM public.club_visitor_passes
              WHERE club_member_id = m.id AND status IN ('pending_payment','pending_approval','active')) THEN
    RAISE EXCEPTION 'You already have a visitor pass in progress';
  END IF;

  INSERT INTO public.club_visitor_passes (club_id, club_member_id, fee_category_id, pass_kind, amount, status)
  VALUES (m.club_id, m.id, cat.id, p_pass_kind, COALESCE(cat.annual_fee,0), 'pending_payment')
  RETURNING id INTO v_pass_id;

  IF COALESCE(cat.annual_fee,0) > 0 THEN
    v_label := cat.name || ' – ' || to_char(now(), 'YYYY-MM-DD HH24:MI');
    INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (m.id, 'visitor_pass', v_label, cat.annual_fee, false, EXTRACT(year FROM now())::int)
    RETURNING id INTO v_fee_id;
    UPDATE public.club_visitor_passes SET fee_payment_id = v_fee_id WHERE id = v_pass_id;
  END IF;

  RETURN public.visitor_pass_sync(v_pass_id);
END; $function$;
