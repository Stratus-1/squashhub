CREATE OR REPLACE FUNCTION public.get_sla_prompt_state(_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_eligible boolean := false;
  v_lead int;
  v_trial date;
  v_accepted timestamptz;
  v_days int;
BEGIN
  IF v_uid IS NULL OR _club_id IS NULL THEN
    RETURN jsonb_build_object('show', false);
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;

  -- Officer / finance permission holders (same set the reminder email targets)
  v_eligible := public.is_club_admin_or_permitted(v_uid, _club_id, 'finance');

  -- Or an address listed on the club billing profile
  IF NOT v_eligible AND v_email IS NOT NULL THEN
    SELECT true INTO v_eligible
    FROM public.club_billing_profiles bp
    WHERE bp.club_id = _club_id
      AND EXISTS (
        SELECT 1 FROM unnest(coalesce(bp.emails, ARRAY[]::text[])) e
        WHERE lower(e) = v_email
      )
    LIMIT 1;
  END IF;

  IF NOT coalesce(v_eligible, false) THEN
    RETURN jsonb_build_object('show', false);
  END IF;

  SELECT c.sla_accepted_at INTO v_accepted FROM public.clubs c WHERE c.id = _club_id;
  IF v_accepted IS NOT NULL THEN
    RETURN jsonb_build_object('show', false, 'sla_accepted', true);
  END IF;

  SELECT (s.trial_ends_at)::date INTO v_trial
  FROM public.club_subscriptions s
  WHERE s.club_id = _club_id AND s.trial_ends_at IS NOT NULL
  ORDER BY s.trial_ends_at DESC
  LIMIT 1;

  SELECT coalesce(NULLIF(value, '')::int, 10) INTO v_lead
  FROM public.app_settings WHERE key = 'trial_end_reminder_days';
  v_lead := greatest(coalesce(v_lead, 10), 1);

  IF v_trial IS NULL THEN
    RETURN jsonb_build_object('show', false, 'sla_accepted', false);
  END IF;

  v_days := v_trial - CURRENT_DATE;

  RETURN jsonb_build_object(
    'show', v_days <= v_lead,
    'sla_accepted', false,
    'trial_ends_at', v_trial,
    'days_left', v_days,
    'lead_days', v_lead
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sla_prompt_state(uuid) TO authenticated;