DROP FUNCTION IF EXISTS public.notify_champ_round_draw(uuid, int, int, int[]);
CREATE OR REPLACE FUNCTION public.notify_champ_round_draw(
  p_champ_id uuid,
  p_round_number int,
  p_group_number int,
  p_sections int[] DEFAULT NULL,
  p_stage_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club_id uuid;
  v_name text;
  v_short_name text;
  v_methods text[];
  v_app boolean;
  v_email boolean;
  v_wa boolean;
  v_wa_out jsonb := '[]'::jsonb;
  v_count int := 0;
  m RECORD;
  v_deadline date;
  v_round_label text;
  v_short_round text;
  v_msg text;
  v_sms text;
  v_url text;
  v_praise text;
  v_praise_sms text;
BEGIN
  IF p_champ_id IS NULL THEN RAISE EXCEPTION 'Missing tournament'; END IF;

  SELECT club_id, name, COALESCE(invite_methods, ARRAY['app']::text[])
    INTO v_club_id, v_name, v_methods
    FROM public.club_champs WHERE id = p_champ_id;
  IF v_club_id IS NULL THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF NOT public.is_club_admin(auth.uid(), v_club_id) THEN
    RAISE EXCEPTION 'Not allowed to notify players for this tournament';
  END IF;

  v_short_name := left(regexp_replace(COALESCE(v_name, 'Club champs'), '[^A-Za-z0-9 ]', '', 'g'), 24);

  v_app   := 'app' = ANY(v_methods);
  v_email := 'email' = ANY(v_methods);
  v_wa    := 'whatsapp' = ANY(v_methods);
  IF NOT (v_app OR v_email OR v_wa) THEN
    RETURN jsonb_build_object('sent', 0, 'whatsapp', '[]'::jsonb, 'channels', to_jsonb(v_methods));
  END IF;

  FOR m IN
    SELECT cm.id,
           cm.player_a_member_id AS a,
           cm.player_b_member_id AS b,
           cm.is_bye,
           cm.bye_member_id,
           COALESCE(cm.play_by, r.play_by) AS deadline,
           COALESCE(NULLIF(r.label, ''), cm.stage_label, 'Round ' || cm.round_number) AS round_label,
           cm.round_number,
           COALESCE(r.scheduling_mode, 'self') AS sched_mode,
           ma.name AS a_name, ma.phone AS a_phone,
           mb.name AS b_name, mb.phone AS b_phone,
           cm.partner_a_member_id AS pa, cm.partner_b_member_id AS pb,
           pa.name AS pa_name, pa.phone AS pa_phone,
           pb.name AS pb_name, pb.phone AS pb_phone
      FROM public.club_champs_matches cm
      LEFT JOIN public.club_champs_rounds r ON r.id = cm.round_id
      LEFT JOIN public.club_members ma ON ma.id = cm.player_a_member_id
      LEFT JOIN public.club_members mb ON mb.id = cm.player_b_member_id
      LEFT JOIN public.club_members pa ON pa.id = cm.partner_a_member_id
      LEFT JOIN public.club_members pb ON pb.id = cm.partner_b_member_id
     WHERE cm.champ_id = p_champ_id
       AND cm.round_number = p_round_number
       AND (p_group_number IS NULL OR cm.group_number = p_group_number)
       AND (p_sections IS NULL OR cm.section_number = ANY(p_sections))
       AND (p_stage_key IS NULL OR cm.stage_key = p_stage_key)
       AND COALESCE(cm.status, 'scheduled') NOT IN ('completed', 'cancelled')
  LOOP
    v_deadline := m.deadline;
    v_round_label := m.round_label;
    v_short_round := 'R' || COALESCE(m.round_number::text, '');
    v_url := CASE WHEN m.sched_mode = 'club'
                  THEN '/club-champs/' || p_champ_id::text
                  ELSE '/tournaments' END;

    v_praise := NULL;
    v_praise_sms := NULL;
    IF lower(v_round_label) ~ '\m(quarter|semi|final)' THEN
      v_praise := 'Well done! You are through to the ' || v_round_label || '. Best of luck with your game. ';
      v_praise_sms := 'Well done! You are through to the '
                   || left(regexp_replace(v_round_label, '[^A-Za-z0-9 ]', '', 'g'), 14)
                   || '. Best of luck. ';
      v_short_round := left(regexp_replace(v_round_label, '[^A-Za-z0-9 ]', '', 'g'), 12);
    END IF;

    IF COALESCE(m.is_bye, false) OR m.a IS NULL OR m.b IS NULL THEN
      DECLARE v_bye uuid := COALESCE(m.bye_member_id, m.a, m.b);
              v_bye_p uuid := CASE WHEN COALESCE(m.bye_member_id, m.a, m.b) = m.a THEN m.pa WHEN COALESCE(m.bye_member_id, m.a, m.b) = m.b THEN m.pb END;
      BEGIN
        FOREACH v_bye IN ARRAY ARRAY_REMOVE(ARRAY[v_bye, v_bye_p], NULL) LOOP
          v_msg := v_name || ' — ' || v_round_label || ': ' || COALESCE(v_praise, '')
                || 'You have a bye and advance to the next round.';
          v_sms := v_short_name || ' ' || v_short_round || ': ' || COALESCE(v_praise_sms, '')
                || 'You have a bye and go through to the next round.';
          IF v_app OR v_email THEN
            INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
            VALUES (v_bye, v_round_label || ' draw', v_msg, 'tournament_round_draw', v_url,
                    jsonb_build_object('champ_id', p_champ_id, 'match_id', m.id,
                                       'send_email', v_email, 'app_silent', NOT v_app), false);
          END IF;
          IF v_wa THEN
            v_wa_out := v_wa_out || jsonb_build_array(jsonb_build_object('member_id', v_bye, 'message', v_msg, 'sms', v_sms));
          END IF;
          v_count := v_count + 1;
        END LOOP;
      END;
      CONTINUE;
    END IF;

    FOR i IN 1..4 LOOP
      DECLARE
        v_to uuid;
        v_opp text;
        v_opp_phone text;
        v_opp_short text;
        v_mate text;
        v_dbl boolean := (m.pa IS NOT NULL OR m.pb IS NOT NULL);
        v_you text := 'You play ';
        v_you_sms text := 'You play ';
      BEGIN
        IF i IN (1, 3) THEN
          v_to := CASE WHEN i = 1 THEN m.a ELSE m.pa END;
          v_mate := CASE WHEN i = 1 THEN m.pa_name ELSE m.a_name END;
          v_opp := COALESCE(m.b_name, 'your opponent')
                || CASE WHEN COALESCE(m.b_phone, '') <> '' THEN ' (' || m.b_phone || ')' ELSE '' END
                || CASE WHEN m.pb IS NOT NULL THEN ' & ' || COALESCE(m.pb_name, 'partner')
                     || CASE WHEN COALESCE(m.pb_phone, '') <> '' THEN ' (' || m.pb_phone || ')' ELSE '' END ELSE '' END;
          v_opp_phone := m.b_phone;
          v_opp_short := left(regexp_replace(COALESCE(m.b_name, 'opponent'), '[^A-Za-z0-9 ]', '', 'g'), 24);
        ELSE
          v_to := CASE WHEN i = 2 THEN m.b ELSE m.pb END;
          v_mate := CASE WHEN i = 2 THEN m.pb_name ELSE m.b_name END;
          v_opp := COALESCE(m.a_name, 'your opponent')
                || CASE WHEN COALESCE(m.a_phone, '') <> '' THEN ' (' || m.a_phone || ')' ELSE '' END
                || CASE WHEN m.pa IS NOT NULL THEN ' & ' || COALESCE(m.pa_name, 'partner')
                     || CASE WHEN COALESCE(m.pa_phone, '') <> '' THEN ' (' || m.pa_phone || ')' ELSE '' END ELSE '' END;
          v_opp_phone := m.a_phone;
          v_opp_short := left(regexp_replace(COALESCE(m.a_name, 'opponent'), '[^A-Za-z0-9 ]', '', 'g'), 24);
        END IF;
        IF v_to IS NULL THEN CONTINUE; END IF;
        IF v_dbl THEN
          v_you := 'You and your partner ' || COALESCE(v_mate, '') || ' play ';
          v_you_sms := 'You + ' || left(regexp_replace(COALESCE(v_mate, 'partner'), '[^A-Za-z0-9 ]', '', 'g'), 16) || ' play ';
        END IF;

        IF m.sched_mode = 'club' THEN
          v_msg := v_name || ' — ' || v_round_label || ': ' || COALESCE(v_praise, '')
                || v_you || v_opp
                || '. Your club will arrange the court and time — you will be notified once it is booked. Please play your match before '
                || COALESCE(to_char(v_deadline, 'DD Mon YYYY'), 'the round deadline') || '.';
          v_sms := v_short_name || ' ' || v_short_round || ': ' || COALESCE(v_praise_sms, '')
                || v_you_sms || v_opp_short
                || CASE WHEN COALESCE(v_opp_phone, '') <> '' THEN ' ' || regexp_replace(v_opp_phone, '[^0-9+]', '', 'g') ELSE '' END
                || '. Club books the court. Play by '
                || COALESCE(to_char(v_deadline, 'DD Mon'), 'the deadline') || '.';
        ELSE
          v_msg := v_name || ' — ' || v_round_label || ': ' || COALESCE(v_praise, '')
                || v_you || v_opp
                || '. Please contact your opponents to arrange your match, then log in to the app, go to Tournaments and make your court booking before '
                || COALESCE(to_char(v_deadline, 'DD Mon YYYY'), 'the round deadline')
                || '. Enter your result there afterwards.';
          v_sms := v_short_name || ' ' || v_short_round || ': ' || COALESCE(v_praise_sms, '')
                || v_you_sms || v_opp_short
                || CASE WHEN COALESCE(v_opp_phone, '') <> '' THEN ' ' || regexp_replace(v_opp_phone, '[^0-9+]', '', 'g') ELSE '' END
                || '. Arrange your match and book a court by '
                || COALESCE(to_char(v_deadline, 'DD Mon'), 'the deadline')
                || '. Log your result in the app.';
        END IF;

        IF v_app OR v_email THEN
          INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
          VALUES (v_to, v_round_label || ' draw', v_msg, 'tournament_round_draw', v_url,
                  jsonb_build_object('champ_id', p_champ_id, 'match_id', m.id,
                                     'opponent_name', v_opp, 'opponent_phone', v_opp_phone,
                                     'partner_name', v_mate,
                                     'play_by', v_deadline,
                                     'scheduling_mode', m.sched_mode,
                                     'send_email', v_email, 'app_silent', NOT v_app), false);
        END IF;
        IF v_wa THEN
          v_wa_out := v_wa_out || jsonb_build_array(jsonb_build_object('member_id', v_to, 'message', v_msg, 'sms', v_sms));
        END IF;
        v_count := v_count + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'sent', v_count,
    'whatsapp', v_wa_out,
    'channels', to_jsonb(v_methods)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_champ_round_draw(uuid, int, int, int[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_champ_round_draw(uuid, int, int, int[], text) TO authenticated;