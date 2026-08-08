
ALTER TABLE public.member_fee_categories
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'annual'
  CHECK (billing_period IN ('annual','monthly'));

ALTER TABLE public.national_body_fees
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'annual'
  CHECK (billing_period IN ('annual','monthly'));

ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS wifi_fee_id uuid;

-- Resolve the effective monthly Wi-Fi fee (linked fee row wins over the flat amount)
CREATE OR REPLACE FUNCTION public.wifi_fee_for_club(_club_id uuid)
RETURNS TABLE(amount numeric, label text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(nb.fee_annual, s.wifi_monthly_fee, 0),
    COALESCE(nb.body_name, 'Wi-Fi access')
  FROM public.club_secrets s
  LEFT JOIN public.national_body_fees nb
    ON nb.id = s.wifi_fee_id AND nb.club_id = s.club_id
  WHERE s.club_id = _club_id
$$;

CREATE OR REPLACE FUNCTION public.request_wifi_access(_club_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _club_id uuid;
  _fee numeric;
  _name text;
  _enabled boolean;
  _label text;
  _period date := date_trunc('month', now())::date;
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
  _label := COALESCE(_name, 'Wi-Fi access') || ' — ' || to_char(now(), 'Mon YYYY');

  INSERT INTO public.club_wifi_subscriptions (club_id, club_member_id, active, auto_renew, monthly_fee, current_period_end, last_billed_period)
  VALUES (_club_id, _club_member_id, true, true, COALESCE(_fee,0), (date_trunc('month', now()) + interval '1 month'), _period)
  ON CONFLICT (club_member_id) DO UPDATE
    SET active = true,
        auto_renew = true,
        cancelled_at = NULL,
        monthly_fee = EXCLUDED.monthly_fee,
        current_period_end = GREATEST(public.club_wifi_subscriptions.current_period_end, EXCLUDED.current_period_end),
        last_billed_period = _period;

  IF COALESCE(_fee,0) > 0 AND NOT EXISTS (
    SELECT 1 FROM public.club_member_fee_payments f
    WHERE f.club_member_id = _club_member_id AND f.fee_type = 'wifi' AND f.fee_label = _label
  ) THEN
    INSERT INTO public.club_member_fee_payments(club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (_club_member_id, 'wifi', _label, _fee, false, EXTRACT(year FROM now())::int);
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', COALESCE(_fee,0), 'label', _label);
END;
$$;

CREATE OR REPLACE FUNCTION public.bill_wifi_monthly()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _period date := date_trunc('month', now())::date;
  _count int := 0;
  _r record;
  _fee numeric;
  _name text;
  _label text;
BEGIN
  FOR _r IN
    SELECT w.id, w.club_id, w.club_member_id
    FROM public.club_wifi_subscriptions w
    JOIN public.club_secrets s ON s.club_id = w.club_id
    WHERE w.active = true
      AND w.auto_renew = true
      AND COALESCE(s.wifi_charge_enabled,false) = true
      AND (w.last_billed_period IS NULL OR w.last_billed_period < _period)
  LOOP
    SELECT f.amount, f.label INTO _fee, _name FROM public.wifi_fee_for_club(_r.club_id) f;
    _label := COALESCE(_name, 'Wi-Fi access') || ' — ' || to_char(now(), 'Mon YYYY');

    IF COALESCE(_fee,0) > 0 AND NOT EXISTS (
      SELECT 1 FROM public.club_member_fee_payments f
      WHERE f.club_member_id = _r.club_member_id AND f.fee_type = 'wifi' AND f.fee_label = _label
    ) THEN
      INSERT INTO public.club_member_fee_payments(club_member_id, fee_type, fee_label, amount, paid, season_year)
      VALUES (_r.club_member_id, 'wifi', _label, _fee, false, EXTRACT(year FROM now())::int);
    END IF;

    UPDATE public.club_wifi_subscriptions
       SET last_billed_period = _period,
           monthly_fee = COALESCE(_fee,0),
           current_period_end = (date_trunc('month', now()) + interval '1 month')
     WHERE id = _r.id;

    _count := _count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'billed', _count);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_wifi_access_status(_club_member_id uuid)
RETURNS TABLE(
  charge_enabled boolean,
  monthly_fee numeric,
  has_access boolean,
  active boolean,
  auto_renew boolean,
  current_period_end timestamptz,
  unpaid_amount numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

REVOKE EXECUTE ON FUNCTION public.bill_wifi_monthly() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wifi_fee_for_club(uuid) FROM anon;
