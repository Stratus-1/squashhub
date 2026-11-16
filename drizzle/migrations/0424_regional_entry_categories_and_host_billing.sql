CREATE OR REPLACE FUNCTION public.tournament_division_options(p_champ_id uuid, p_member_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t record; i int; v_div_gender text; v_label text; v_member_gender text; v_type text;
  v_flat int; v_req boolean; out_arr jsonb := '[]'::jsonb;
BEGIN
  SELECT id, num_groups, gender, group_labels, league_genders, league_formats, league_match_types, match_type, beta_lifecycle, club_id, league_sources, division_fees
    INTO t FROM public.tournaments WHERE id = p_champ_id;
  IF NOT FOUND THEN RETURN out_arr; END IF;
  SELECT coalesce(payment_required, false) INTO v_req FROM public.club_champs WHERE id = p_champ_id;
  v_flat := coalesce(public.champ_entry_fee_cents(p_champ_id), 0);
  IF p_member_id IS NOT NULL AND t.beta_lifecycle ? 'category_types' THEN
    SELECT gender INTO v_member_gender FROM public.club_members WHERE id = p_member_id AND (club_id = t.club_id OR public.is_member_eligible_for_tournament(p_champ_id, p_member_id));
  END IF;
  FOR i IN 1..GREATEST(COALESCE(t.num_groups, 1), 1) LOOP
    v_div_gender := lower(COALESCE(NULLIF(COALESCE(t.league_genders ->> i::text, ''), ''), COALESCE(t.gender, 'open')));
    v_type := t.beta_lifecycle -> 'category_types' ->> i::text;
    IF v_type IS NOT NULL AND p_member_id IS NOT NULL THEN
      IF v_member_gender IS NULL AND v_type IN ('mens','ladies') THEN CONTINUE; END IF;
      IF v_type = 'mens' AND lower(coalesce(v_member_gender,'')) NOT IN ('m','male','men','man','mens','men''s','gents') THEN CONTINUE; END IF;
      IF v_type = 'ladies' AND lower(coalesce(v_member_gender,'')) NOT IN ('f','female','ladies','lady','woman','women') THEN CONTINUE; END IF;
    END IF;
    IF p_member_id IS NOT NULL
       AND t.league_sources -> i::text IS NOT NULL
       AND jsonb_typeof(t.league_sources -> i::text) = 'array'
       AND jsonb_array_length(t.league_sources -> i::text) > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.member_league_registrations mlr
        WHERE mlr.club_member_id = p_member_id
          AND mlr.league_id::text IN (SELECT jsonb_array_elements_text(t.league_sources -> i::text))
      ) THEN CONTINUE; END IF;
    END IF;
    v_label := public.tournament_group_display_label(t.beta_lifecycle, NULLIF(COALESCE(t.group_labels ->> i::text, ''), ''), i);
    IF v_label IS NULL THEN v_label := 'League ' || i::text; END IF;
    out_arr := out_arr || jsonb_build_object(
      'group_number', i,
      'label', v_label,
      'gender', coalesce(v_type, v_div_gender),
      'format', COALESCE(t.league_formats ->> i::text, ''),
      'match_type', COALESCE(t.league_match_types ->> i::text, t.match_type),
      'fee_cents', CASE WHEN coalesce(v_req, false)
        THEN coalesce((t.division_fees ->> i::text)::int, v_flat)
        ELSE 0 END
    );
  END LOOP;
  RETURN out_arr;
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_tournament_invite_public(p_token text, p_accept boolean, p_verify text DEFAULT NULL::text, p_divisions integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_fee_id uuid;
  v_amount numeric;
  v_next_status text;
  v_label text;
  v_status text;
  v_allowed int[];
  v_choices int[];
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  IF v_reg.invite_revoked_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation has been withdrawn'; END IF;

  SELECT id, name, phone, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;

  IF NOT (auth.uid() IS NOT NULL AND v_member.user_id IS NOT NULL AND auth.uid() = v_member.user_id) THEN
    IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      RAISE EXCEPTION 'We could not verify that this invitation is yours. Please check the detail you entered.';
    END IF;
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  v_status := lower(COALESCE(v_reg.status, ''));

  IF p_accept AND v_reg.confirmed_at IS NOT NULL
     AND v_status IN ('paid','waived','registered','active','pending_payment','pending_eft')
     AND p_divisions IS NULL THEN
    RETURN jsonb_build_object('status', v_reg.status, 'champ_id', v_reg.champ_id, 'registration_id', v_reg.id, 'already', true);
  END IF;
  IF NOT p_accept AND v_status = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled', 'champ_id', v_reg.champ_id, 'registration_id', v_reg.id, 'already', true);
  END IF;

  IF p_accept AND v_champ.registration_closes_at IS NOT NULL AND now() > v_champ.registration_closes_at THEN
    RAISE EXCEPTION 'Entries for this tournament have closed';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.club_champs_registrations
       SET status = 'cancelled', confirmed_at = NULL, confirmed_by = NULL,
           confirmation_source = NULL, declined_at = COALESCE(declined_at, now()),
           invite_viewed_at = COALESCE(invite_viewed_at, now())
     WHERE id = v_reg.id;
    RETURN jsonb_build_object('status', 'cancelled', 'champ_id', v_reg.champ_id, 'registration_id', v_reg.id);
  END IF;

  -- Only divisions this member may enter are accepted.
  IF p_divisions IS NOT NULL AND array_length(p_divisions, 1) > 0 THEN
    SELECT array_agg((d ->> 'group_number')::int)
      INTO v_allowed
      FROM jsonb_array_elements(public.tournament_division_options(v_reg.champ_id, v_reg.club_member_id)) d;
    SELECT array_agg(DISTINCT x) INTO v_choices
      FROM unnest(p_divisions) x WHERE x = ANY (COALESCE(v_allowed, '{}'));
    IF COALESCE(array_length(v_choices, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Please choose at least one division you are eligible for';
    END IF;
    UPDATE public.club_champs_registrations SET division_choices = v_choices WHERE id = v_reg.id;
  END IF;

  v_amount := COALESCE(v_champ.entry_fee_cents, 0)::numeric / 100;

  IF COALESCE(v_champ.payment_required, false) AND v_amount > 0 THEN
    v_label := COALESCE(v_champ.name, 'Tournament') || ' entry fee';
    -- Visiting players (regional/national events) are billed at the host club, never on their home club ledger.
    INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (coalesce(public.resolve_host_billing_member(v_reg.club_member_id, v_champ.club_id), v_reg.club_member_id), 'tournament_entry', v_label, v_amount, false,
            EXTRACT(YEAR FROM COALESCE(v_champ.start_date, now()))::int)
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
    DO UPDATE SET amount = EXCLUDED.amount
    RETURNING id INTO v_fee_id;
    v_next_status := CASE WHEN v_status = 'pending_eft' THEN 'pending_eft' ELSE 'pending_payment' END;
  ELSE
    v_next_status := 'paid';
  END IF;

  UPDATE public.club_champs_registrations
     SET status = v_next_status,
         fee_payment_id = COALESCE(v_fee_id, fee_payment_id),
         confirmed_at = COALESCE(confirmed_at, now()),
         confirmed_by = COALESCE(confirmed_by, auth.uid(), confirmed_by),
         confirmation_source = COALESCE(confirmation_source, 'invite_link'),
         declined_at = NULL,
         invite_viewed_at = COALESCE(invite_viewed_at, now())
   WHERE id = v_reg.id;

  PERFORM public.apply_registration_division_choices(v_reg.id);

  RETURN jsonb_build_object('status', v_next_status, 'fee_payment_id', v_fee_id,
                            'champ_id', v_reg.champ_id, 'registration_id', v_reg.id);
END;
$function$;