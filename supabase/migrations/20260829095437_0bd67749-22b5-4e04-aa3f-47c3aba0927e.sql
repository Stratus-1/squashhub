CREATE OR REPLACE FUNCTION public.notify_champ_round_draw(
  p_champ_id uuid,
  p_round_number int,
  p_group_number int,
  p_sections int[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club_id uuid;
  v_name text;
  v_methods text[];
  v_app boolean;
  v_email boolean;
  v_wa boolean;
  v_wa_out jsonb := '[]'::jsonb;
  v_count int := 0;
  m RECORD;
  v_deadline date;
  v_round_label text;
  v_msg text;
  v_url text;
BEGIN
  IF p_champ_id IS NULL THEN RAISE EXCEPTION 'Missing tournament'; END IF;

  SELECT club_id, name, COALESCE(invite_methods, ARRAY['app']::text[])
    INTO v_club_id, v_name, v_methods
    FROM public.club_champs WHERE id = p_champ_id;
  IF v_club_id IS NULL THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF NOT public.is_club_admin(auth.uid(), v_club_id) THEN
    RAISE EXCEPTION 'Not allowed to notify players for this tournament';
  END IF;

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
           COALESCE(r.scheduling_mode, 'self') AS sched_mode,
           ma.name AS a_name, ma.phone AS a_phone,
           mb.name AS b_name, mb.phone AS b_phone
      FROM public.club_champs_matches cm
      LEFT JOIN public.club_champs_rounds r ON r.id = cm.round_id
      LEFT JOIN public.club_members ma ON ma.id = cm.player_a_member_id
      LEFT JOIN public.club_members mb ON mb.id = cm.player_b_member_id
     WHERE cm.champ_id = p_champ_id
       AND cm.round_number = p_round_number
       AND (p_group_number IS NULL OR cm.group_number = p_group_number)
       AND (p_sections IS NULL OR cm.section_number = ANY(p_sections))
       AND COALESCE(cm.status, 'scheduled') NOT IN ('completed', 'cancelled')
  LOOP
    v_deadline := m.deadline;
    v_round_label := m.round_label;
    v_url := CASE WHEN m.sched_mode = 'club'
                  THEN '/club-champs/' || p_champ_id::text
                  ELSE '/tournaments' END;

    IF COALESCE(m.is_bye, false) OR m.a IS NULL OR m.b IS NULL THEN
      DECLARE v_bye uuid := COALESCE(m.bye_member_id, m.a, m.b);
      BEGIN
        IF v_bye IS NOT NULL THEN
          v_msg := v_name || ' — ' || v_round_label || ': you have a bye and advance to the next round.';
          IF v_app OR v_email THEN
            INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
            VALUES (v_bye, v_round_label || ' draw', v_msg, 'tournament_round_draw', v_url,
                    jsonb_build_object('champ_id', p_champ_id, 'match_id', m.id,
                                       'send_email', v_email, 'app_silent', NOT v_app), false);
          END IF;
          IF v_wa THEN
            v_wa_out := v_wa_out || jsonb_build_array(jsonb_build_object('member_id', v_bye, 'message', v_msg));
          END IF;
          v_count := v_count + 1;
        END IF;
      END;
      CONTINUE;
    END IF;

    FOR i IN 1..2 LOOP
      DECLARE
        v_to uuid;
        v_opp text;
        v_opp_phone text;
      BEGIN
        IF i = 1 THEN
          v_to := m.a; v_opp := COALESCE(m.b_name, 'your opponent'); v_opp_phone := m.b_phone;
        ELSE
          v_to := m.b; v_opp := COALESCE(m.a_name, 'your opponent'); v_opp_phone := m.a_phone;
        END IF;
        IF v_to IS NULL THEN CONTINUE; END IF;

        IF m.sched_mode = 'club' THEN
          v_msg := v_name || ' — ' || v_round_label || ': you play ' || v_opp
                || CASE WHEN COALESCE(v_opp_phone, '') <> '' THEN ' (' || v_opp_phone || ')' ELSE '' END
                || '. Your club will arrange the court and time — you will be notified once it is booked. Please play your match before '
                || COALESCE(to_char(v_deadline, 'DD Mon YYYY'), 'the round deadline') || '.';
        ELSE
          v_msg := v_name || ' — ' || v_round_label || ': you play ' || v_opp
                || CASE WHEN COALESCE(v_opp_phone, '') <> '' THEN ' (' || v_opp_phone || ')' ELSE '' END
                || '. Please contact your opponent to arrange your match, then log in to the app, go to Tournaments and make your court booking before '
                || COALESCE(to_char(v_deadline, 'DD Mon YYYY'), 'the round deadline')
                || '. Enter your result there afterwards.';
        END IF;

        IF v_app OR v_email THEN
          INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
          VALUES (v_to, v_round_label || ' draw', v_msg, 'tournament_round_draw', v_url,
                  jsonb_build_object('champ_id', p_champ_id, 'match_id', m.id,
                                     'opponent_name', v_opp, 'opponent_phone', v_opp_phone,
                                     'play_by', v_deadline,
                                     'scheduling_mode', m.sched_mode,
                                     'send_email', v_email, 'app_silent', NOT v_app), false);
        END IF;
        IF v_wa THEN
          v_wa_out := v_wa_out || jsonb_build_array(jsonb_build_object('member_id', v_to, 'message', v_msg));
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

REVOKE ALL ON FUNCTION public.notify_champ_round_draw(uuid, int, int, int[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_champ_round_draw(uuid, int, int, int[]) TO authenticated;