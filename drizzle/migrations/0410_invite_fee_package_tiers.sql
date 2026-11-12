CREATE OR REPLACE FUNCTION public.champ_fee_pricing_json(p_champ_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'entry_fee_basis', t.entry_fee_basis,
    'entry_fee_tiers', CASE WHEN t.entry_fee_basis = 'tiered' THEN t.entry_fee_tiers ELSE NULL END)
  FROM public.tournaments t WHERE t.id = p_champ_id
$$;
REVOKE ALL ON FUNCTION public.champ_fee_pricing_json(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_tournament_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base jsonb; v_reg record; v_champ record; v_partner text; v_cat text;
  v_token text := trim(COALESCE(p_token, ''));
BEGIN
  v_base := public.get_tournament_invite_base(p_token);
  IF NOT COALESCE((v_base->>'found')::boolean, false) THEN RETURN v_base; END IF;
  IF (v_base->>'champ_id') IS NOT NULL THEN
    v_base := v_base || COALESCE(public.champ_fee_pricing_json((v_base->>'champ_id')::uuid), '{}'::jsonb);
  END IF;
  IF length(v_token) < 32 THEN
    SELECT isc.invite_token INTO v_token FROM public.invite_short_codes isc
     WHERE isc.code = regexp_replace(lower(v_token), '[^a-z0-9]+$', '');
  END IF;
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = v_token;
  IF NOT FOUND THEN RETURN v_base; END IF;
  SELECT group_labels INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF v_reg.partner_member_id IS NOT NULL THEN
    SELECT NULLIF(trim(name), '') INTO v_partner FROM public.club_members WHERE id = v_reg.partner_member_id;
    IF v_partner IS NOT NULL AND position(' ' IN v_partner) > 0 THEN
      v_partner := split_part(v_partner, ' ', 1) || ' ' || upper(left(split_part(v_partner, ' ', 2), 1)) || '.';
    END IF;
  END IF;
  IF COALESCE(array_length(v_reg.division_choices, 1), 0) > 0 THEN
    v_cat := NULLIF(v_champ.group_labels ->> (v_reg.division_choices[1])::text, '');
  END IF;
  RETURN v_base || jsonb_build_object(
    'admin_entered', COALESCE(v_reg.invited_by_admin, false)
        AND (v_reg.registration_source = 'admin' OR v_reg.confirmation_source = 'admin'),
    'partner_name', v_partner,
    'entry_category', v_cat,
    'fee_status', v_reg.fee_status,
    'fee_settled_via', v_reg.fee_settled_via
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_tournament_invite_preview(p_champ_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_champ record;
  v_club record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_tournament(auth.uid(), p_champ_id) THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = p_champ_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT id, name, subdomain INTO v_club FROM public.clubs WHERE id = v_champ.club_id;

  RETURN jsonb_build_object(
    'found', true,
    'test', true,
    'champ_id', v_champ.id,
    'tournament_name', v_champ.name,
    'description', v_champ.description,
    'start_date', v_champ.start_date,
    'end_date', v_champ.end_date,
    'registration_closes_at', v_champ.registration_closes_at,
    'entry_fee_cents', COALESCE(v_champ.entry_fee_cents, 0),
    'payment_required', COALESCE(v_champ.payment_required, false),
    'divisions', public.tournament_division_options(p_champ_id, NULL),
    'selected_divisions', '[]'::jsonb,
    'scheduling_mode', COALESCE(v_champ.scheduling_mode, 'club'),
    'club_name', v_club.name,
    'club_subdomain', v_club.subdomain,
    'invitee_name', 'Test recipient',
    'status', 'invited',
    'verification_kind', 'none',
    'can_respond_public', true,
    'is_invitee', true
  ) || COALESCE(public.champ_fee_pricing_json(p_champ_id), '{}'::jsonb);
END;
$function$;