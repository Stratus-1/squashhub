
ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS wifi_charge_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wifi_monthly_fee numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.club_wifi_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  auto_renew boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '1 month'),
  last_billed_period date,
  monthly_fee numeric NOT NULL DEFAULT 0,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_member_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_wifi_subscriptions TO authenticated;
GRANT ALL ON public.club_wifi_subscriptions TO service_role;

ALTER TABLE public.club_wifi_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own wifi subscription"
ON public.club_wifi_subscriptions FOR SELECT TO authenticated
USING (
  public.is_member_owner(club_member_id)
  OR public.is_club_admin(auth.uid(), club_id)
);

CREATE POLICY "Admins manage wifi subscriptions"
ON public.club_wifi_subscriptions FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE TRIGGER trg_club_wifi_subscriptions_updated_at
BEFORE UPDATE ON public.club_wifi_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: does this member currently have Wi-Fi access?
CREATE OR REPLACE FUNCTION public.has_wifi_access(_club_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.club_secrets s
      JOIN public.club_members m ON m.club_id = s.club_id
      WHERE m.id = _club_member_id AND s.wifi_charge_enabled = true
    ) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.club_wifi_subscriptions w
      WHERE w.club_member_id = _club_member_id
        AND w.active = true
        AND w.current_period_end > now()
    ) AND NOT EXISTS (
      SELECT 1 FROM public.club_member_fee_payments f
      WHERE f.club_member_id = _club_member_id
        AND f.fee_type = 'wifi'
        AND f.paid = false
        AND f.created_at < now() - interval '30 days'
    )
  END
$$;

-- Gate credential release on an active, paid-up Wi-Fi pass
CREATE OR REPLACE FUNCTION public.get_club_wifi(_club_id uuid)
RETURNS TABLE(ssid text, password text, security text, hidden boolean, notes text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.wifi_ssid, s.wifi_password, s.wifi_security, s.wifi_hidden, s.wifi_notes
  FROM public.club_secrets s
  WHERE s.club_id = _club_id
    AND s.wifi_enabled = true
    AND s.wifi_ssid IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.club_members m
      WHERE m.club_id = _club_id
        AND m.user_id = auth.uid()
        AND COALESCE(m.status::text, 'active') <> 'resigned'
        AND (s.wifi_visitors_allowed OR m.role <> 'visitor')
        AND public.has_wifi_access(m.id)
    )
$$;

-- Status for the member tile (works whether or not they have a pass)
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
    COALESCE(s.wifi_monthly_fee, 0),
    public.has_wifi_access(_club_member_id),
    COALESCE(w.active, false),
    COALESCE(w.auto_renew, false),
    w.current_period_end,
    COALESCE((
      SELECT SUM(f.amount) FROM public.club_member_fee_payments f
      WHERE f.club_member_id = _club_member_id AND f.fee_type = 'wifi' AND f.paid = false
    ), 0)
  FROM public.club_secrets s
  LEFT JOIN public.club_wifi_subscriptions w ON w.club_member_id = _club_member_id
  WHERE s.club_id = _club_id;
END;
$$;

-- Member requests (or renews) monthly Wi-Fi access; fee is levied to their account
CREATE OR REPLACE FUNCTION public.request_wifi_access(_club_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _club_id uuid;
  _fee numeric;
  _enabled boolean;
  _label text;
  _period date := date_trunc('month', now())::date;
BEGIN
  SELECT m.club_id INTO _club_id FROM public.club_members m WHERE m.id = _club_member_id;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT (public.is_member_owner(_club_member_id) OR public.is_club_admin(auth.uid(), _club_id)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT COALESCE(s.wifi_charge_enabled,false), COALESCE(s.wifi_monthly_fee,0)
    INTO _enabled, _fee
  FROM public.club_secrets s WHERE s.club_id = _club_id;

  IF NOT COALESCE(_enabled,false) THEN
    RAISE EXCEPTION 'Wi-Fi access is not charged for at this club';
  END IF;

  _label := 'Wi-Fi access — ' || to_char(now(), 'Mon YYYY');

  INSERT INTO public.club_wifi_subscriptions (club_id, club_member_id, active, auto_renew, monthly_fee, current_period_end, last_billed_period)
  VALUES (_club_id, _club_member_id, true, true, _fee, (date_trunc('month', now()) + interval '1 month'), _period)
  ON CONFLICT (club_member_id) DO UPDATE
    SET active = true,
        auto_renew = true,
        cancelled_at = NULL,
        monthly_fee = EXCLUDED.monthly_fee,
        current_period_end = GREATEST(public.club_wifi_subscriptions.current_period_end, EXCLUDED.current_period_end),
        last_billed_period = CASE
          WHEN public.club_wifi_subscriptions.last_billed_period IS DISTINCT FROM _period THEN _period
          ELSE public.club_wifi_subscriptions.last_billed_period END;

  -- Levy this month's fee once
  IF _fee > 0 AND NOT EXISTS (
    SELECT 1 FROM public.club_member_fee_payments f
    WHERE f.club_member_id = _club_member_id AND f.fee_type = 'wifi' AND f.fee_label = _label
  ) THEN
    INSERT INTO public.club_member_fee_payments(club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (_club_member_id, 'wifi', _label, _fee, false, EXTRACT(year FROM now())::int);
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', _fee, 'label', _label);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_wifi_access(_club_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _club_id uuid;
BEGIN
  SELECT m.club_id INTO _club_id FROM public.club_members m WHERE m.id = _club_member_id;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT (public.is_member_owner(_club_member_id) OR public.is_club_admin(auth.uid(), _club_id)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE public.club_wifi_subscriptions
     SET auto_renew = false, cancelled_at = now()
   WHERE club_member_id = _club_member_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Monthly levy job: bill every active auto-renewing subscriber and extend access
CREATE OR REPLACE FUNCTION public.bill_wifi_monthly()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _period date := date_trunc('month', now())::date;
  _label text := 'Wi-Fi access — ' || to_char(now(), 'Mon YYYY');
  _count int := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT w.id, w.club_member_id, COALESCE(s.wifi_monthly_fee, w.monthly_fee) AS fee
    FROM public.club_wifi_subscriptions w
    JOIN public.club_secrets s ON s.club_id = w.club_id
    WHERE w.active = true
      AND w.auto_renew = true
      AND COALESCE(s.wifi_charge_enabled,false) = true
      AND (w.last_billed_period IS NULL OR w.last_billed_period < _period)
  LOOP
    IF _r.fee > 0 AND NOT EXISTS (
      SELECT 1 FROM public.club_member_fee_payments f
      WHERE f.club_member_id = _r.club_member_id AND f.fee_type = 'wifi' AND f.fee_label = _label
    ) THEN
      INSERT INTO public.club_member_fee_payments(club_member_id, fee_type, fee_label, amount, paid, season_year)
      VALUES (_r.club_member_id, 'wifi', _label, _r.fee, false, EXTRACT(year FROM now())::int);
    END IF;

    UPDATE public.club_wifi_subscriptions
       SET last_billed_period = _period,
           monthly_fee = _r.fee,
           current_period_end = (date_trunc('month', now()) + interval '1 month')
     WHERE id = _r.id;

    _count := _count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'billed', _count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bill_wifi_monthly() FROM anon, authenticated;
