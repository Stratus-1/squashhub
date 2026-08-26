-- Channel-consistent notifications for doubles pairing / complete-registration.
CREATE OR REPLACE FUNCTION public.notify_doubles_pair(p_pair_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p record;
  v_club_id uuid; v_name text; v_methods text[]; v_sub text;
  v_app boolean; v_email boolean; v_wa boolean;
  v_fee int; v_fee_txt text;
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
    RETURN jsonb_build_object('sent', 0, 'whatsapp', '[]'::jsonb, 'channels', to_jsonb(v_methods));
  END IF;

  v_fee := COALESCE(public.champ_entry_fee_cents(p.champ_id), 0);
  v_fee_txt := 'R' || to_char(v_fee / 100.0, 'FM999G999D00');
  v_label := COALESCE(
    NULLIF(( SELECT (t.group_labels ->> p.group_number::text) FROM public.tournaments t WHERE t.id = p.champ_id ), ''),
    'League ' || p.group_number::text);

  FOR i IN 1..2 LOOP
    IF i = 1 THEN v_to := p.member_a; v_other := p.member_b; ELSE v_to := p.member_b; v_other := p.member_a; END IF;
    IF v_to IS NULL THEN CONTINUE; END IF;

    SELECT name INTO v_other_name FROM public.club_members WHERE id = v_other;
    SELECT invite_token INTO v_token FROM public.club_champs_registrations
     WHERE champ_id = p.champ_id AND club_member_id = v_to;

    v_paid := public.champ_member_fee_paid(p.champ_id, v_to);
    v_covered := p.pays_for_partner AND p.payer_member_id IS DISTINCT FROM v_to;

    v_url := CASE WHEN v_token IS NOT NULL THEN '/i/' || v_token ELSE '/club-champs/' || p.champ_id::text END;

    v_msg := v_name || ' — ' || v_label || ' doubles: you are paired with '
          || COALESCE(v_other_name, 'your partner') || '. ';
    IF v_fee = 0 OR v_paid THEN
      v_msg := v_msg || 'Your entry fee is settled — nothing further to pay.';
    ELSIF v_covered THEN
      v_msg := v_msg || COALESCE(v_other_name, 'Your partner') || ' is paying your ' || v_fee_txt
            || ' entry fee. Open the link to confirm your entry.';
    ELSE
      v_msg := v_msg || 'Entry fee of ' || v_fee_txt
            || ' is still outstanding — complete your registration to lock the pair.';
    END IF;
    IF p.status <> 'confirmed' THEN
      v_msg := v_msg || ' The pair is only locked once all entry fees are paid.';
    END IF;

    IF v_app OR v_email THEN
      INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
      VALUES (v_to, 'Doubles partner', v_msg, 'tournament_doubles_pair', v_url,
              jsonb_build_object('champ_id', p.champ_id, 'pair_id', p.id, 'group_number', p.group_number,
                                 'partner_member_id', v_other, 'partner_name', v_other_name,
                                 'entry_fee_cents', v_fee, 'fee_covered', v_covered,
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
                            'status', p.status);
END $$;