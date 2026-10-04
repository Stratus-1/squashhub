CREATE OR REPLACE FUNCTION public.champ_member_total_due_cents(p_champ_id uuid, p_member_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_reg uuid; v_total int := 0; pr record; v_partner uuid;
BEGIN
  SELECT id INTO v_reg FROM public.club_champs_registrations
   WHERE champ_id = p_champ_id AND club_member_id = p_member_id
     AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn') LIMIT 1;
  IF v_reg IS NULL THEN RETURN 0; END IF;
  IF public.champ_member_fee_paid(p_champ_id, p_member_id) THEN v_total := 0;
  ELSE v_total := coalesce(public.champ_reg_own_due_cents(v_reg), 0); END IF;
  -- Partner shares this member has promised to pay and that are still unpaid.
  FOR pr IN SELECT * FROM public.champ_doubles_pairs
             WHERE champ_id = p_champ_id AND pays_for_partner AND payer_member_id = p_member_id
               AND status NOT IN ('cancelled','declined') LOOP
    v_partner := CASE WHEN pr.member_a = p_member_id THEN pr.member_b ELSE pr.member_a END;
    IF v_partner IS NOT NULL AND NOT coalesce(public.champ_member_fee_paid(p_champ_id, v_partner), false) THEN
      v_total := v_total + coalesce(public.champ_division_fee_cents(p_champ_id, pr.group_number), 0);
    END IF;
  END LOOP;
  RETURN v_total;
END $$;
GRANT EXECUTE ON FUNCTION public.champ_member_total_due_cents(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_doubles_pair(p_pair_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  v_club_id uuid; v_name text; v_methods text[]; v_sub text;
  v_app boolean; v_email boolean; v_wa boolean;
  v_fee int; v_fee_txt text; v_total int; v_total_txt text;
  v_wa_out jsonb := '[]'::jsonb; v_count int := 0;
  v_label text;
  i int; v_to uuid; v_other uuid; v_other_name text; v_msg text; v_url text; v_token text;
  v_covered boolean; v_paid boolean;
BEGIN
  SELECT * INTO p FROM public.champ_doubles_pairs WHERE id = p_pair_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This pairing no longer exists'; END IF;

  SELECT t.club_id, t.name, COALESCE(t.invite_methods, ARRAY['app']::text[]), c.subdomain
    INTO v_club_id, v_name, v_methods, v_sub
    FROM public.tournaments t LEFT JOIN public.clubs c ON c.id = t.club_id
   WHERE t.id = p.champ_id;

  IF NOT (public.can_manage_tournament(p.champ_id)
          OR public.champ_actor_member(p.champ_id, NULL, NULL) IN (p.member_a, p.member_b)) THEN
    RAISE EXCEPTION 'Not allowed to notify these players';
  END IF;

  v_app := 'app' = ANY(v_methods);
  v_email := 'email' = ANY(v_methods);
  v_wa := 'whatsapp' = ANY(v_methods);
  IF NOT (v_app OR v_email OR v_wa) THEN
    RETURN jsonb_build_object('sent', 0, 'whatsapp', '[]'::jsonb, 'channels', to_jsonb(v_methods),
                              'club_id', v_club_id);
  END IF;

  -- Per-event price for this doubles event.
  v_fee := COALESCE(public.champ_division_fee_cents(p.champ_id, p.group_number), public.champ_entry_fee_cents(p.champ_id), 0);
  v_fee_txt := 'R' || to_char(v_fee / 100.0, 'FM999G999D00');
  v_label := COALESCE(
    NULLIF(( SELECT (t.group_labels ->> p.group_number::text) FROM public.tournaments t WHERE t.id = p.champ_id ), ''),
    'League ' || p.group_number::text);
  IF v_label !~* 'doubles' THEN v_label := v_label || ' doubles'; END IF;

  FOR i IN 1..2 LOOP
    IF i = 1 THEN v_to := p.member_a; v_other := p.member_b; ELSE v_to := p.member_b; v_other := p.member_a; END IF;
    IF v_to IS NULL THEN CONTINUE; END IF;

    SELECT name INTO v_other_name FROM public.club_members WHERE id = v_other;
    SELECT invite_token INTO v_token FROM public.club_champs_registrations
     WHERE champ_id = p.champ_id AND club_member_id = v_to;

    v_paid := public.champ_member_fee_paid(p.champ_id, v_to);
    v_covered := p.pays_for_partner AND p.payer_member_id IS DISTINCT FROM v_to;
    v_total := COALESCE(public.champ_member_total_due_cents(p.champ_id, v_to), 0);
    v_total_txt := 'R' || to_char(v_total / 100.0, 'FM999G999D00');

    v_url := CASE WHEN v_token IS NOT NULL THEN '/i/' || v_token ELSE '/club-champs/' || p.champ_id::text END;

    v_msg := v_name || ' — ' || v_label || ': you are paired with '
          || COALESCE(v_other_name, 'your partner') || '. ';
    IF v_covered AND v_total = 0 THEN
      v_msg := v_msg || COALESCE(v_other_name, 'Your partner') || ' is paying your ' || v_fee_txt
            || ' doubles fee. Open the link to confirm your entry.';
    ELSIF v_fee = 0 OR v_total = 0 THEN
      v_msg := v_msg || 'Your entry fees are settled — nothing further to pay.';
    ELSE
      IF v_covered THEN
        v_msg := v_msg || COALESCE(v_other_name, 'Your partner') || ' is paying your ' || v_fee_txt || ' doubles fee. ';
      ELSIF p.pays_for_partner AND p.payer_member_id = v_to THEN
        v_msg := v_msg || 'You are paying both doubles fees. ';
      END IF;
      v_msg := v_msg || 'Your total outstanding for this tournament is ' || v_total_txt
            || ' — pay it to complete your entry.';
    END IF;
    IF p.status <> 'confirmed' THEN
      v_msg := v_msg || ' The pair is only locked once all entry fees are paid.';
    END IF;

    IF v_app OR v_email THEN
      INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
      VALUES (v_to, 'Doubles partner', v_msg, 'tournament_doubles_pair', v_url,
              jsonb_build_object('champ_id', p.champ_id, 'pair_id', p.id, 'group_number', p.group_number,
                                 'partner_member_id', v_other, 'partner_name', v_other_name,
                                 'entry_fee_cents', v_fee, 'total_due_cents', v_total, 'fee_covered', v_covered,
                                 'send_email', v_email, 'app_silent', NOT v_app), false);
    END IF;
    IF v_wa THEN
      v_wa_out := v_wa_out || jsonb_build_array(jsonb_build_object(
        'member_id', v_to,
        'message', v_msg || CASE WHEN v_token IS NOT NULL
                                 THEN ' ' || COALESCE('https://' || v_sub || '.squashhub.co.za', 'https://squashhub.co.za') || v_url
                                 ELSE '' END));
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('sent', v_count, 'whatsapp', v_wa_out, 'channels', to_jsonb(v_methods),
                            'status', p.status, 'club_id', v_club_id);
END $function$;