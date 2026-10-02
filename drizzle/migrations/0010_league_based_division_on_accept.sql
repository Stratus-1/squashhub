CREATE OR REPLACE FUNCTION public.tournament_league_division_for(p_champ_id uuid, p_member_id uuid)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  t record; g text; i int; ids jsonb; dg text; hits int[] := '{}';
BEGIN
  SELECT num_groups, league_sources, league_source_modes, league_genders INTO t FROM public.tournaments WHERE id = p_champ_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT CASE WHEN lower(coalesce(gender,'')) IN ('f','female','ladies','lady','woman','women') THEN 'female'
              WHEN lower(coalesce(gender,'')) IN ('m','male','men','man','mens','men''s','gents') THEN 'male' ELSE 'unknown' END
    INTO g FROM public.club_members WHERE id = p_member_id;
  FOR i IN 1..GREATEST(coalesce(t.num_groups,1),1) LOOP
    ids := coalesce(t.league_sources -> i::text, '[]'::jsonb);
    IF coalesce(t.league_source_modes ->> i::text, 'selected') = 'all' OR jsonb_array_length(ids) = 0 THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.member_league_registrations r
                   WHERE r.club_member_id = p_member_id AND r.league_id::text IN (SELECT jsonb_array_elements_text(ids))) THEN CONTINUE; END IF;
    dg := lower(coalesce(t.league_genders ->> i::text, ''));
    IF dg IN ('men','mens','male') AND g <> 'male' THEN CONTINUE; END IF;
    IF dg IN ('ladies','female','women') AND g <> 'female' THEN CONTINUE; END IF;
    hits := hits || i;
  END LOOP;
  RETURN CASE WHEN array_length(hits,1) = 1 THEN hits[1] ELSE NULL END;
END $$;
REVOKE ALL ON FUNCTION public.tournament_league_division_for(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tournament_league_division_for(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_tournament_invite(p_registration_id uuid, p_accept boolean, p_divisions integer[] DEFAULT NULL::integer[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record; v_champ record; v_member record; v_fee_id uuid; v_amount numeric;
  v_next_status text; v_label text; v_allowed int[]; v_choices int[]; v_auto int;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
  SELECT * INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorised for this registration';
  END IF;
  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;

  IF NOT p_accept THEN
    UPDATE public.club_champs_registrations
       SET status = 'cancelled', confirmed_at = NULL, confirmed_by = NULL, confirmation_source = NULL
     WHERE id = p_registration_id;
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;

  IF p_divisions IS NOT NULL AND array_length(p_divisions, 1) > 0 THEN
    SELECT array_agg((d ->> 'group_number')::int) INTO v_allowed
      FROM jsonb_array_elements(public.tournament_division_options(v_reg.champ_id, v_reg.club_member_id)) d;
    SELECT array_agg(DISTINCT x) INTO v_choices
      FROM unnest(p_divisions) x WHERE x = ANY (COALESCE(v_allowed, '{}'));
    IF COALESCE(array_length(v_choices, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Please choose at least one division you are eligible for';
    END IF;
    UPDATE public.club_champs_registrations SET division_choices = v_choices WHERE id = p_registration_id;
  ELSIF COALESCE(array_length(v_reg.division_choices, 1), 0) = 0 THEN
    -- No choice made: place by the player's own league when exactly one division draws from it.
    v_auto := public.tournament_league_division_for(v_reg.champ_id, v_reg.club_member_id);
    IF v_auto IS NOT NULL THEN
      UPDATE public.club_champs_registrations SET division_choices = ARRAY[v_auto] WHERE id = p_registration_id;
    END IF;
  END IF;

  v_amount := COALESCE(v_champ.entry_fee_cents, 0)::numeric / 100;
  IF COALESCE(v_champ.payment_required, false) AND v_amount > 0 THEN
    v_label := COALESCE(v_champ.name, 'Tournament') || ' entry fee';
    INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (v_reg.club_member_id, 'tournament_entry', v_label, v_amount, false,
            EXTRACT(YEAR FROM COALESCE(v_champ.start_date, now()))::int)
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
    DO UPDATE SET amount = EXCLUDED.amount, paid = false, paid_at = NULL
    RETURNING id INTO v_fee_id;
    v_next_status := CASE WHEN v_reg.status = 'pending_eft' THEN 'pending_eft' ELSE 'pending_payment' END;
  ELSE
    v_next_status := 'paid';
  END IF;

  UPDATE public.club_champs_registrations
     SET status = v_next_status,
         fee_payment_id = COALESCE(v_fee_id, fee_payment_id),
         confirmed_at = COALESCE(confirmed_at, now()),
         confirmed_by = COALESCE(confirmed_by, auth.uid()),
         confirmation_source = COALESCE(confirmation_source, 'rsvp')
   WHERE id = p_registration_id;

  PERFORM public.apply_registration_division_choices(p_registration_id);
  RETURN jsonb_build_object('status', v_next_status, 'fee_payment_id', v_fee_id);
END;
$function$;