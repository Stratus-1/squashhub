-- 1. Capability store
CREATE TABLE IF NOT EXISTS public.club_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  capability text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  disabled_at timestamptz,
  enabled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_club_capabilities_club ON public.club_capabilities(club_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_capabilities TO authenticated;
GRANT ALL ON public.club_capabilities TO service_role;

ALTER TABLE public.club_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their club capabilities"
ON public.club_capabilities FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.club_id = club_capabilities.club_id AND cm.user_id = auth.uid())
  OR public.is_club_admin(auth.uid(), club_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Club admins manage capabilities"
ON public.club_capabilities FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_club_capabilities_updated_at
BEFORE UPDATE ON public.club_capabilities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Lookup helper (fail-open when no row exists so legacy paths never break)
CREATE OR REPLACE FUNCTION public.club_has_capability(_club_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.club_capabilities
      WHERE club_id = _club_id AND capability = _capability),
    true
  );
$$;

GRANT EXECUTE ON FUNCTION public.club_has_capability(uuid, text) TO authenticated, anon, service_role;

-- 3. Keep legacy flags in sync (capabilities are the master switch)
CREATE OR REPLACE FUNCTION public.sync_capability_legacy_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.capability = 'bar' THEN
    UPDATE public.clubs SET honesty_bar_enabled = NEW.enabled WHERE id = NEW.club_id;
  ELSIF NEW.capability = 'whatsapp' THEN
    UPDATE public.clubs SET whatsapp_enabled = NEW.enabled WHERE id = NEW.club_id;
  ELSIF NEW.capability = 'ranking_points' THEN
    UPDATE public.clubs SET ranking_points_enabled = NEW.enabled WHERE id = NEW.club_id;
  ELSIF NEW.capability = 'lights' THEN
    UPDATE public.clubs SET lights_integration_enabled = NEW.enabled WHERE id = NEW.club_id;
  ELSIF NEW.capability = 'wifi' THEN
    UPDATE public.club_secrets SET wifi_enabled = NEW.enabled WHERE club_id = NEW.club_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_capability_legacy_flags
AFTER INSERT OR UPDATE OF enabled ON public.club_capabilities
FOR EACH ROW EXECUTE FUNCTION public.sync_capability_legacy_flags();

-- 4. Conservative backfill for every existing club
INSERT INTO public.club_capabilities (club_id, capability, enabled, enabled_at)
SELECT c.id, v.capability, v.enabled, CASE WHEN v.enabled THEN now() END
FROM public.clubs c
CROSS JOIN LATERAL (
  VALUES
    ('bookings', EXISTS (SELECT 1 FROM public.courts ct WHERE ct.club_id = c.id)
                 OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.club_id = c.id)),
    ('bar', COALESCE(c.honesty_bar_enabled, false)
            OR EXISTS (SELECT 1 FROM public.bar_items bi WHERE bi.club_id = c.id)),
    ('access_control', EXISTS (SELECT 1 FROM public.club_secrets s WHERE s.club_id = c.id
                               AND COALESCE(s.access_control_type, 'none') <> 'none')),
    ('wifi', EXISTS (SELECT 1 FROM public.club_secrets s WHERE s.club_id = c.id AND COALESCE(s.wifi_enabled, false))
             OR EXISTS (SELECT 1 FROM public.club_wifi_subscriptions w WHERE w.club_id = c.id)),
    ('membership_fees', EXISTS (SELECT 1 FROM public.member_fee_categories f WHERE f.club_id = c.id)),
    ('payments', EXISTS (SELECT 1 FROM public.club_secrets s WHERE s.club_id = c.id
                         AND (s.bank_account_number IS NOT NULL OR s.payment_gateway_secret_key IS NOT NULL))
                 OR c.payment_gateway IS NOT NULL),
    ('finance', EXISTS (SELECT 1 FROM public.club_journal_entries j WHERE j.club_id = c.id)),
    ('leagues', EXISTS (SELECT 1 FROM public.league_associations la WHERE la.club_id = c.id)),
    ('tournaments', EXISTS (SELECT 1 FROM public.tournaments t WHERE t.club_id = c.id)),
    ('ladder', EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = c.id AND m.ladder_position IS NOT NULL)),
    ('ranking_points', COALESCE(c.ranking_points_enabled, false)),
    ('visitors', EXISTS (SELECT 1 FROM public.club_visitors cv WHERE cv.club_id = c.id)),
    ('whatsapp', COALESCE(c.whatsapp_enabled, false)),
    ('lights', COALESCE(c.lights_integration_enabled, false)),
    ('events', true)
) AS v(capability, enabled)
ON CONFLICT (club_id, capability) DO NOTHING;

-- 5. Seed defaults for newly created clubs
CREATE OR REPLACE FUNCTION public.seed_default_club_capabilities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.club_capabilities (club_id, capability, enabled, enabled_at)
  SELECT NEW.id, v.capability, v.enabled, CASE WHEN v.enabled THEN now() END
  FROM (VALUES
    ('bookings', true), ('ladder', true), ('events', true),
    ('bar', false), ('access_control', false), ('wifi', false),
    ('membership_fees', false), ('payments', false), ('finance', false),
    ('leagues', false), ('tournaments', false), ('ranking_points', false),
    ('visitors', false), ('whatsapp', false), ('lights', false)
  ) AS v(capability, enabled)
  ON CONFLICT (club_id, capability) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_default_club_capabilities
AFTER INSERT ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.seed_default_club_capabilities();

-- 6. Server-side enforcement on write paths of optional modules
CREATE OR REPLACE FUNCTION public.enforce_capability_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cap text := TG_ARGV[0];
BEGIN
  IF NEW.club_id IS NOT NULL AND NOT public.club_has_capability(NEW.club_id, _cap) THEN
    RAISE EXCEPTION 'Feature "%" is turned off for this club', _cap
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_capability_bookings BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_capability_enabled('bookings');

CREATE TRIGGER trg_capability_bar_tab BEFORE INSERT ON public.bar_tab_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_capability_enabled('bar');

CREATE TRIGGER trg_capability_bar_visitor BEFORE INSERT ON public.bar_visitor_sales
FOR EACH ROW EXECUTE FUNCTION public.enforce_capability_enabled('bar');

CREATE TRIGGER trg_capability_challenges BEFORE INSERT ON public.challenges
FOR EACH ROW EXECUTE FUNCTION public.enforce_capability_enabled('ladder');

CREATE TRIGGER trg_capability_wifi_subs BEFORE INSERT ON public.club_wifi_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.enforce_capability_enabled('wifi');