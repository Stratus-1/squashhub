DROP FUNCTION IF EXISTS public.get_wifi_access_status(uuid);

CREATE OR REPLACE FUNCTION public.get_wifi_access_status(_club_member_id uuid)
RETURNS TABLE (
  wifi_enabled boolean,
  charge_enabled boolean,
  monthly_fee numeric,
  has_access boolean,
  active boolean,
  auto_renew boolean,
  current_period_end timestamptz,
  unpaid_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _club_id uuid;
BEGIN
  SELECT m.club_id INTO _club_id FROM public.club_members m WHERE m.id = _club_member_id;
  IF _club_id IS NULL THEN RETURN; END IF;
  IF NOT (public.is_member_owner(_club_member_id) OR public.is_club_admin(auth.uid(), _club_id)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(s.wifi_enabled, false),
    COALESCE(s.wifi_charge_enabled, false),
    COALESCE((SELECT f.amount FROM public.wifi_fee_for_club(_club_id) f), 0),
    public.has_wifi_access(_club_member_id),
    COALESCE(w.active, false),
    COALESCE(w.auto_renew, false),
    w.current_period_end,
    COALESCE((
      SELECT SUM(f2.amount) FROM public.club_member_fee_payments f2
      WHERE f2.club_member_id = _club_member_id AND f2.fee_type = 'wifi' AND f2.paid = false
    ), 0)
  FROM public.club_secrets s
  LEFT JOIN public.club_wifi_subscriptions w ON w.club_member_id = _club_member_id
  WHERE s.club_id = _club_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wifi_access_status(uuid) TO authenticated;