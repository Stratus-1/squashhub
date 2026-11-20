
CREATE OR REPLACE FUNCTION public._champ_partner_can_join_division(p_champ_id uuid, p_member_id uuid, p_group_number integer)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_champs_registrations r
     WHERE r.champ_id = p_champ_id
       AND r.club_member_id = p_member_id
       AND lower(COALESCE(r.status,'')) NOT IN ('cancelled','declined','withdrawn','withdrawn_keep_position')
       AND r.declined_at IS NULL
       AND r.invite_revoked_at IS NULL
       AND (r.invited_at IS NOT NULL OR r.confirmed_at IS NOT NULL)
       AND COALESCE(array_length(r.division_choices, 1), 0) > 0
       AND NOT (p_group_number = ANY (r.division_choices))
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(public.tournament_division_options(p_champ_id, p_member_id)) d
          WHERE (d ->> 'group_number')::int = p_group_number)
  );
$$;
REVOKE ALL ON FUNCTION public._champ_partner_can_join_division(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_doubles_partner_options(p_champ_id uuid, p_group_number integer, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_me uuid; v_rows jsonb; v_kind text; v_my_gender text; v_want text;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN RETURN '[]'::jsonb; END IF;

  SELECT lower(COALESCE(t.beta_lifecycle -> 'category_types' ->> p_group_number::text,
                        NULLIF(t.league_genders ->> p_group_number::text, ''), t.gender, 'open'))
    INTO v_kind FROM public.tournaments t WHERE t.id = p_champ_id;
  SELECT CASE
           WHEN lower(coalesce(gender,'')) IN ('m','male','men','man','mens','men''s','gents') THEN 'm'
           WHEN lower(coalesce(gender,'')) IN ('f','female','ladies','lady','woman','women') THEN 'f'
         END INTO v_my_gender FROM public.club_members WHERE id = v_me;
  v_want := CASE
              WHEN v_kind IN ('mens','men','male','m') THEN 'm'
              WHEN v_kind IN ('ladies','women','female','f') THEN 'f'
              WHEN v_kind = 'mixed' AND v_my_gender = 'm' THEN 'f'
              WHEN v_kind = 'mixed' AND v_my_gender = 'f' THEN 'm'
            END;

  SELECT COALESCE(jsonb_agg(s.x ORDER BY s.nm), '[]'::jsonb) INTO v_rows FROM (
    SELECT m.name AS nm, jsonb_build_object(
             'member_id', m.id,
             'display_name', m.name,
             'club_id', m.club_id,
             'club_name', c.name,
             'gender', m.gender,
             'ladder_position', m.ladder_position,
             'fee_paid', public.champ_member_fee_paid(p_champ_id, m.id),
             'accepted', r.confirmed_at IS NOT NULL,
             'is_user', m.user_id IS NOT NULL,
             'has_email', COALESCE(btrim(m.email), '') <> '',
             'needs_entry', COALESCE(array_length(r.division_choices, 1), 0) > 0
                            AND NOT (p_group_number = ANY (r.division_choices))
           ) AS x
      FROM public.club_champs_registrations r
      JOIN public.club_members m ON m.id = r.club_member_id
      LEFT JOIN public.clubs c ON c.id = m.club_id
     WHERE r.champ_id = p_champ_id
       AND m.id <> v_me
       AND lower(COALESCE(r.status, '')) NOT IN ('cancelled','declined','withdrawn')
       AND r.declined_at IS NULL
       AND r.invite_revoked_at IS NULL
       AND (
             p_group_number = ANY (COALESCE(r.division_choices, '{}'))
             OR (
               COALESCE(array_length(r.division_choices, 1), 0) = 0
               AND (r.invited_at IS NOT NULL OR r.confirmed_at IS NOT NULL)
             )
             -- Entered other categories only: choosing them enters them here too.
             OR public._champ_partner_can_join_division(p_champ_id, m.id, p_group_number)
           )
       AND (
             v_want IS NULL
             OR CASE
                  WHEN lower(coalesce(m.gender,'')) IN ('m','male','men','man','mens','men''s','gents') THEN 'm'
                  WHEN lower(coalesce(m.gender,'')) IN ('f','female','ladies','lady','woman','women') THEN 'f'
                END IS NULL
             OR CASE
                  WHEN lower(coalesce(m.gender,'')) IN ('m','male','men','man','mens','men''s','gents') THEN 'm'
                  WHEN lower(coalesce(m.gender,'')) IN ('f','female','ladies','lady','woman','women') THEN 'f'
                END = v_want
           )
       AND (p_search IS NULL OR trim(p_search) = '' OR m.name ILIKE '%' || trim(p_search) || '%')
       AND NOT EXISTS (
         SELECT 1 FROM public.champ_doubles_pairs p
          WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number
            AND p.status IN ('pending','awaiting_payment','confirmed')
            AND m.id IN (p.member_a, p.member_b)
       )
     ORDER BY m.name
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500)
  ) s;
  RETURN v_rows;
END $function$;

CREATE OR REPLACE FUNCTION public.propose_doubles_partner(p_champ_id uuid, p_group_number integer, p_partner_member_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text, p_pay_for_partner boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_me uuid; v_existing record; v_id uuid; v_status text; v_both boolean := COALESCE(p_pay_for_partner, true);
        v_join_reg record; v_club uuid;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF v_me = p_partner_member_id THEN RAISE EXCEPTION 'You cannot pair with yourself'; END IF;
  IF public.champ_pairing_locked(p_champ_id) THEN RAISE EXCEPTION 'Doubles pairs are locked by the organiser'; END IF;
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN RAISE EXCEPTION 'This division is not a doubles division'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_champ_id::text || ':' || p_group_number::text, 0));
  IF NOT public.champ_member_accepted(p_champ_id, v_me, p_group_number) THEN
    RAISE EXCEPTION 'Please complete your own registration for this division first';
  END IF;
  IF NOT public.champ_member_invited(p_champ_id, p_partner_member_id, p_group_number) THEN
    -- An invited player who entered other categories may be chosen here; the choice enters them.
    IF NOT public._champ_partner_can_join_division(p_champ_id, p_partner_member_id, p_group_number) THEN
      RAISE EXCEPTION 'You can only pick a partner from the invited players for this division.';
    END IF;
    SELECT * INTO v_join_reg FROM public.club_champs_registrations r
     WHERE r.champ_id = p_champ_id AND r.club_member_id = p_partner_member_id
       AND lower(COALESCE(r.status,'')) NOT IN ('cancelled','declined','withdrawn','withdrawn_keep_position')
       AND r.declined_at IS NULL AND r.invite_revoked_at IS NULL
     ORDER BY r.created_at DESC LIMIT 1
     FOR UPDATE;
  END IF;
  IF EXISTS (SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number
       AND p.status IN ('awaiting_payment','confirmed')
       AND (p.member_a IN (v_me, p_partner_member_id) OR p.member_b IN (v_me, p_partner_member_id))) THEN
    RAISE EXCEPTION 'One of these players is already paired in this division';
  END IF;
  SELECT * INTO v_existing FROM public.champ_doubles_pairs p
   WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number AND p.status = 'pending'
     AND ((p.member_a = p_partner_member_id AND p.member_b = v_me) OR (p.member_a = v_me AND p.member_b = p_partner_member_id))
   LIMIT 1;
  IF FOUND THEN
    UPDATE public.champ_doubles_pairs
       SET responded_at = now(), responded_by = v_me, accepted_at = COALESCE(accepted_at, now()),
           status = 'awaiting_payment',
           pays_for_partner = v_both,
           payer_member_id = CASE WHEN v_both THEN COALESCE(payer_member_id, v_me) ELSE NULL END
     WHERE id = v_existing.id;
    v_status := public.champ_pair_settle(v_existing.id);
    RETURN jsonb_build_object('id', v_existing.id, 'status', v_status);
  END IF;

  IF v_join_reg.id IS NOT NULL THEN
    UPDATE public.club_champs_registrations
       SET division_choices = array_append(division_choices, p_group_number)
     WHERE id = v_join_reg.id AND NOT (p_group_number = ANY (COALESCE(division_choices, '{}')));
    PERFORM public.apply_registration_division_choices(v_join_reg.id);
  END IF;

  UPDATE public.champ_doubles_pairs SET status = 'cancelled', responded_at = now(), responded_by = v_me
   WHERE champ_id = p_champ_id AND group_number = p_group_number AND status = 'pending' AND proposed_by = v_me;
  INSERT INTO public.champ_doubles_pairs (champ_id, group_number, member_a, member_b, proposed_by, status,
                                          accepted_at, responded_at, responded_by, pays_for_partner, payer_member_id, origin)
  VALUES (p_champ_id, p_group_number, v_me, p_partner_member_id, v_me, 'awaiting_payment',
          now(), now(), v_me, v_both, CASE WHEN v_both THEN v_me ELSE NULL END, 'player')
  RETURNING id INTO v_id;

  IF v_join_reg.id IS NOT NULL THEN
    -- Price the partner's package after the pair exists, so a chooser's cover is counted.
    -- Unpaid fees adjust via audited _champ_fee_adjust; paid fees get an 'additional events' charge.
    PERFORM public.refresh_tournament_entry_fee(v_join_reg.id);
    SELECT club_id INTO v_club FROM public.tournaments WHERE id = p_champ_id;
    INSERT INTO public.audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data, after_data)
    VALUES (v_club, auth.uid(), 'club_champs_registration', v_join_reg.id, 'doubles_partner_entered_category',
            'Chosen as doubles partner in a category they had not entered',
            jsonb_build_object('division_choices', v_join_reg.division_choices),
            jsonb_build_object('group_number', p_group_number, 'chosen_by_member_id', v_me,
                               'pair_id', v_id, 'chooser_pays_both', v_both));
  END IF;

  v_status := public.champ_pair_settle(v_id);
  RETURN jsonb_build_object('id', v_id, 'status', v_status, 'partner_entered_category', v_join_reg.id IS NOT NULL);
END $function$;
