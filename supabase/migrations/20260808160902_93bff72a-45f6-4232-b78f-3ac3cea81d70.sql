CREATE OR REPLACE FUNCTION public.request_wifi_access(_club_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _club_id uuid;
  _fee numeric;
  _name text;
  _enabled boolean;
  _label text;
  _period date := date_trunc('month', now())::date;
  _days_in_month int := EXTRACT(day FROM (date_trunc('month', now()) + interval '1 month - 1 day'))::int;
  _days_left int;
  _charge numeric;
  _prorata boolean := false;
BEGIN
  SELECT m.club_id INTO _club_id FROM public.club_members m WHERE m.id = _club_member_id;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT (public.is_member_owner(_club_member_id) OR public.is_club_admin(auth.uid(), _club_id)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT COALESCE(s.wifi_charge_enabled,false) INTO _enabled
  FROM public.club_secrets s WHERE s.club_id = _club_id;
  IF NOT COALESCE(_enabled,false) THEN
    RAISE EXCEPTION 'Wi-Fi access is not charged for at this club';
  END IF;

  SELECT f.amount, f.label INTO _fee, _name FROM public.wifi_fee_for_club(_club_id) f;

  _days_left := _days_in_month - EXTRACT(day FROM now())::int + 1;
  IF _days_left < _days_in_month THEN
    _prorata := true;
    _charge := ROUND(COALESCE(_fee,0) * _days_left::numeric / _days_in_month::numeric, 2);
  ELSE
    _charge := COALESCE(_fee,0);
  END IF;

  _label := COALESCE(_name, 'Wi-Fi access') || ' — ' || to_char(now(), 'Mon YYYY')
            || CASE WHEN _prorata THEN ' (pro-rata)' ELSE '' END;

  INSERT INTO public.club_wifi_subscriptions (club_id, club_member_id, active, auto_renew, monthly_fee, current_period_end, last_billed_period)
  VALUES (_club_id, _club_member_id, true, true, COALESCE(_fee,0), (date_trunc('month', now()) + interval '1 month'), _period)
  ON CONFLICT (club_member_id) DO UPDATE
    SET active = true,
        auto_renew = true,
        cancelled_at = NULL,
        monthly_fee = EXCLUDED.monthly_fee,
        current_period_end = GREATEST(public.club_wifi_subscriptions.current_period_end, EXCLUDED.current_period_end),
        last_billed_period = _period;

  IF COALESCE(_charge,0) > 0 AND NOT EXISTS (
    SELECT 1 FROM public.club_member_fee_payments f
    WHERE f.club_member_id = _club_member_id AND f.fee_type = 'wifi' AND f.fee_label = _label
  ) THEN
    INSERT INTO public.club_member_fee_payments(club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (_club_member_id, 'wifi', _label, _charge, false, EXTRACT(year FROM now())::int);
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', COALESCE(_charge,0), 'monthly_fee', COALESCE(_fee,0), 'prorata', _prorata, 'label', _label);
END;
$function$;