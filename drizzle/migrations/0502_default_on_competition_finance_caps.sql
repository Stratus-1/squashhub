CREATE OR REPLACE FUNCTION public.seed_default_club_capabilities()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.club_capabilities (club_id, capability, enabled, enabled_at)
  SELECT NEW.id, v.capability, v.enabled, CASE WHEN v.enabled THEN now() END
  FROM (VALUES
    ('bookings', true), ('ladder', true), ('events', true),
    ('bar', false), ('access_control', false), ('wifi', false),
    ('membership_fees', true), ('payments', true), ('finance', true),
    ('leagues', true), ('tournaments', true), ('ranking_points', false),
    ('visitors', false), ('whatsapp', false), ('lights', false)
  ) AS v(capability, enabled)
  ON CONFLICT (club_id, capability) DO NOTHING;
  RETURN NEW;
END;
$function$;

UPDATE public.club_capabilities cc
SET enabled = true, enabled_at = now(), disabled_at = NULL, updated_at = now()
FROM public.clubs c
WHERE c.id = cc.club_id
  AND c.sla_accepted_at IS NULL
  AND COALESCE(c.tenant_type, 'club') = 'club'
  AND cc.enabled_by IS NULL
  AND cc.enabled = false
  AND cc.capability IN ('membership_fees','payments','finance','leagues','tournaments');