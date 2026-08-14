-- Router credentials live in the restricted secrets table
ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS router_username text,
  ADD COLUMN IF NOT EXISTS router_password text,
  ADD COLUMN IF NOT EXISTS router_api_token text;

CREATE TABLE public.club_router_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  driver text NOT NULL DEFAULT 'generic_http',
  model text,
  host text,
  port integer,
  use_https boolean NOT NULL DEFAULT false,
  poll_interval_minutes integer NOT NULL DEFAULT 15,
  notes text,
  last_polled_at timestamptz,
  last_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_router_configs TO authenticated;
GRANT ALL ON public.club_router_configs TO service_role;
ALTER TABLE public.club_router_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins manage router config" ON public.club_router_configs
  FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE TABLE public.club_data_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  size_mb numeric NOT NULL,
  purchased_at date NOT NULL DEFAULT (now()::date),
  cost numeric,
  baseline_bytes bigint NOT NULL DEFAULT 0,
  used_bytes bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX club_data_bundles_one_active ON public.club_data_bundles (club_id) WHERE is_active;
CREATE INDEX club_data_bundles_club_idx ON public.club_data_bundles (club_id, purchased_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_data_bundles TO authenticated;
GRANT ALL ON public.club_data_bundles TO service_role;
ALTER TABLE public.club_data_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins manage data bundles" ON public.club_data_bundles
  FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE TABLE public.club_router_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  bundle_id uuid REFERENCES public.club_data_bundles(id) ON DELETE SET NULL,
  polled_at timestamptz NOT NULL DEFAULT now(),
  online boolean NOT NULL DEFAULT false,
  signal_strength integer,
  signal_unit text,
  uptime_seconds bigint,
  total_bytes bigint,
  error text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX club_router_polls_club_idx ON public.club_router_polls (club_id, polled_at DESC);
GRANT SELECT, INSERT ON public.club_router_polls TO authenticated;
GRANT ALL ON public.club_router_polls TO service_role;
ALTER TABLE public.club_router_polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins read router polls" ON public.club_router_polls
  FOR SELECT TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

CREATE TABLE public.club_router_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE UNIQUE,
  thresholds integer[] NOT NULL DEFAULT ARRAY[75,90,95],
  notify_email boolean NOT NULL DEFAULT true,
  notify_push boolean NOT NULL DEFAULT true,
  notify_offline boolean NOT NULL DEFAULT true,
  recipients text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_router_alert_settings TO authenticated;
GRANT ALL ON public.club_router_alert_settings TO service_role;
ALTER TABLE public.club_router_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins manage router alert settings" ON public.club_router_alert_settings
  FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE TABLE public.club_router_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  bundle_id uuid REFERENCES public.club_data_bundles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'usage',
  threshold integer,
  message text,
  channels text[] NOT NULL DEFAULT ARRAY[]::text[],
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX club_router_alerts_unique_threshold
  ON public.club_router_alerts (bundle_id, threshold) WHERE kind = 'usage' AND bundle_id IS NOT NULL;
CREATE INDEX club_router_alerts_club_idx ON public.club_router_alerts (club_id, sent_at DESC);
GRANT SELECT ON public.club_router_alerts TO authenticated;
GRANT ALL ON public.club_router_alerts TO service_role;
ALTER TABLE public.club_router_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins read router alerts" ON public.club_router_alerts
  FOR SELECT TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

CREATE TRIGGER update_club_router_configs_updated_at BEFORE UPDATE ON public.club_router_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_club_data_bundles_updated_at BEFORE UPDATE ON public.club_data_bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_club_router_alert_settings_updated_at BEFORE UPDATE ON public.club_router_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Purchase a new bundle: archives the active one and resets the baseline
CREATE OR REPLACE FUNCTION public.purchase_data_bundle(
  _club_id uuid,
  _size_mb numeric,
  _purchased_at date DEFAULT (now()::date),
  _cost numeric DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _baseline bigint;
  _new_id uuid;
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT total_bytes INTO _baseline
  FROM public.club_router_polls
  WHERE club_id = _club_id AND total_bytes IS NOT NULL
  ORDER BY polled_at DESC
  LIMIT 1;

  UPDATE public.club_data_bundles
     SET is_active = false, archived_at = now()
   WHERE club_id = _club_id AND is_active;

  INSERT INTO public.club_data_bundles (club_id, size_mb, purchased_at, cost, baseline_bytes, notes)
  VALUES (_club_id, _size_mb, COALESCE(_purchased_at, now()::date), _cost, COALESCE(_baseline, 0), _notes)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.purchase_data_bundle(uuid, numeric, date, numeric, text) TO authenticated;