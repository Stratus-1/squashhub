ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS draw_notice_state text,
  ADD COLUMN IF NOT EXISTS draw_notice_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS draw_notice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS draw_notice_wa_pending boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.club_champs_matches ADD CONSTRAINT club_champs_matches_draw_notice_state_chk
    CHECK (draw_notice_state IS NULL OR draw_notice_state IN ('pending','auto','dismissed','sent','off','correction'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS club_champs_matches_draw_notice_open_idx
  ON public.club_champs_matches (champ_id)
  WHERE draw_notice_state IN ('pending','dismissed','correction') OR draw_notice_wa_pending;

CREATE OR REPLACE FUNCTION public._champ_draw_notice_mode(p_champ_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN t.beta_lifecycle->'draw_notify' = '"auto"'::jsonb THEN 'auto'
    WHEN t.beta_lifecycle->'draw_notify' = 'false'::jsonb OR t.beta_lifecycle->'draw_notify' = '"off"'::jsonb THEN 'off'
    ELSE 'prompt' END
  FROM public.tournaments t WHERE t.id = p_champ_id
$$;

CREATE OR REPLACE FUNCTION public._champ_match_draw_notice_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_mode text; v_now_ok boolean; v_was_ok boolean;
BEGIN
  v_now_ok := NOT COALESCE(NEW.is_bye, false)
    AND NEW.player_a_member_id IS NOT NULL AND NEW.player_b_member_id IS NOT NULL
    AND COALESCE(NEW.stage, 'group') <> 'placeholder'
    AND COALESCE(NEW.status, 'scheduled') NOT IN ('completed','cancelled');
  IF NOT v_now_ok THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    v_was_ok := NOT COALESCE(OLD.is_bye, false) AND OLD.player_a_member_id IS NOT NULL AND OLD.player_b_member_id IS NOT NULL;
    IF v_was_ok THEN
      IF NEW.player_a_member_id IS NOT DISTINCT FROM OLD.player_a_member_id
         AND NEW.player_b_member_id IS NOT DISTINCT FROM OLD.player_b_member_id
         AND NEW.partner_a_member_id IS NOT DISTINCT FROM OLD.partner_a_member_id
         AND NEW.partner_b_member_id IS NOT DISTINCT FROM OLD.partner_b_member_id THEN
        RETURN NEW;
      END IF;
      IF OLD.draw_notice_state = 'sent' THEN NEW.draw_notice_state := 'correction'; END IF;
      RETURN NEW;
    END IF;
    IF OLD.draw_notice_state IS NOT NULL THEN RETURN NEW; END IF;
  ELSIF NEW.draw_notice_state IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_mode := COALESCE(public._champ_draw_notice_mode(NEW.champ_id), 'prompt');
  NEW.draw_notice_confirmed_at := now();
  NEW.draw_notice_state := CASE v_mode WHEN 'auto' THEN 'auto' WHEN 'off' THEN 'off' ELSE 'pending' END;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._champ_fixture_draw_notify(p_match_ids uuid[], p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_out jsonb := '[]'::jsonb; v_count int := 0; v_chan text[] := ARRAY[]::text[];
  m RECORD; v_ids uuid[]; v_app boolean; v_email boolean; v_wa boolean;
  v_to uuid; v_opp text; v_mate text; v_msg text; v_sms text; v_when text; v_when_sms text; v_pref text;
BEGIN
  IF p_kind = 'wa' THEN
    WITH c AS (UPDATE public.club_champs_matches SET draw_notice_wa_pending = false
               WHERE id = ANY(p_match_ids) AND draw_notice_wa_pending RETURNING id)
    SELECT array_agg(id) INTO v_ids FROM c;
  ELSE
    WITH c AS (UPDATE public.club_champs_matches SET draw_notice_state = 'sent', draw_notice_sent_at = now()
               WHERE id = ANY(p_match_ids) AND draw_notice_state IN ('pending','auto','dismissed','correction')
                 AND player_a_member_id IS NOT NULL AND player_b_member_id IS NOT NULL AND NOT COALESCE(is_bye,false)
               RETURNING id)
    SELECT array_agg(id) INTO v_ids FROM c;
  END IF;
  IF v_ids IS NULL THEN RETURN jsonb_build_object('sent', 0, 'whatsapp', v_out, 'channels', to_jsonb(v_chan)); END IF;

  FOR m IN
    SELECT cm.id, cm.champ_id, ch.name AS t_name, COALESCE(ch.invite_methods, ARRAY['app']::text[]) AS methods,
           cm.player_a_member_id a, cm.player_b_member_id b, cm.partner_a_member_id pa, cm.partner_b_member_id pb,
           COALESCE(cm.play_by, r.play_by) deadline, cm.scheduled_date s_date, cm.scheduled_time s_time, ct.name court_name,
           COALESCE(NULLIF(r.label,''), NULLIF(cm.stage_label,''), 'Round ' || cm.round_number) round_label,
           COALESCE(r.scheduling_mode, 'self') sched_mode,
           ma.name a_name, ma.phone a_phone, mb.name b_name, mb.phone b_phone, xa.name pa_name, xb.name pb_name
      FROM public.club_champs_matches cm
      JOIN public.club_champs ch ON ch.id = cm.champ_id
      LEFT JOIN public.club_champs_rounds r ON r.id = cm.round_id
      LEFT JOIN public.courts ct ON ct.id = cm.court_id
      LEFT JOIN public.club_members ma ON ma.id = cm.player_a_member_id
      LEFT JOIN public.club_members mb ON mb.id = cm.player_b_member_id
      LEFT JOIN public.club_members xa ON xa.id = cm.partner_a_member_id
      LEFT JOIN public.club_members xb ON xb.id = cm.partner_b_member_id
     WHERE cm.id = ANY(v_ids)
  LOOP
    v_chan := m.methods;
    v_app := 'app' = ANY(m.methods); v_email := 'email' = ANY(m.methods); v_wa := 'whatsapp' = ANY(m.methods);
    IF m.s_date IS NOT NULL AND m.s_time IS NOT NULL THEN
      v_when := '. Your match is scheduled for ' || to_char(m.s_date, 'Dy DD Mon YYYY') || ' at ' || to_char(m.s_time, 'HH24:MI')
             || CASE WHEN m.court_name IS NOT NULL THEN ' on ' || m.court_name ELSE '' END || '.';
      v_when_sms := '. ' || to_char(m.s_date, 'DD Mon') || ' ' || to_char(m.s_time, 'HH24:MI')
             || CASE WHEN m.court_name IS NOT NULL THEN ' ' || left(m.court_name, 12) ELSE '' END || '.';
    ELSIF m.sched_mode = 'club' THEN
      v_when := '. Your club will arrange the court and time — you will be notified once it is set.'
             || CASE WHEN m.deadline IS NOT NULL THEN ' Play by ' || to_char(m.deadline, 'DD Mon YYYY') || '.' ELSE '' END;
      v_when_sms := '. Club sets court/time.' || CASE WHEN m.deadline IS NOT NULL THEN ' Play by ' || to_char(m.deadline, 'DD Mon') || '.' ELSE '' END;
    ELSE
      v_when := '. Please arrange your match with your opponent and book a court in the app'
             || CASE WHEN m.deadline IS NOT NULL THEN ' — play by ' || to_char(m.deadline, 'DD Mon YYYY') ELSE '' END || '.';
      v_when_sms := '. Arrange + book a court' || CASE WHEN m.deadline IS NOT NULL THEN ' by ' || to_char(m.deadline, 'DD Mon') ELSE '' END || '.';
    END IF;

    FOR i IN 1..4 LOOP
      v_to := CASE i WHEN 1 THEN m.a WHEN 2 THEN m.b WHEN 3 THEN m.pa ELSE m.pb END;
      CONTINUE WHEN v_to IS NULL;
      IF i IN (1,3) THEN
        v_opp := COALESCE(m.b_name, 'your opponent') || CASE WHEN COALESCE(m.b_phone,'') <> '' THEN ' (' || m.b_phone || ')' ELSE '' END
              || CASE WHEN m.pb IS NOT NULL THEN ' & ' || COALESCE(m.pb_name, 'partner') ELSE '' END;
        v_mate := CASE WHEN i = 1 THEN m.pa_name ELSE m.a_name END;
      ELSE
        v_opp := COALESCE(m.a_name, 'your opponent') || CASE WHEN COALESCE(m.a_phone,'') <> '' THEN ' (' || m.a_phone || ')' ELSE '' END
              || CASE WHEN m.pa IS NOT NULL THEN ' & ' || COALESCE(m.pa_name, 'partner') ELSE '' END;
        v_mate := CASE WHEN i = 2 THEN m.pb_name ELSE m.b_name END;
      END IF;
      v_pref := CASE WHEN m.pa IS NOT NULL OR m.pb IS NOT NULL THEN 'You and your partner ' || COALESCE(v_mate, '') || ' play ' ELSE 'You play ' END;
      v_msg := m.t_name || ' — ' || m.round_label || ': ' || v_pref || v_opp || v_when || ' Enter your result in the app afterwards.';
      v_sms := left(regexp_replace(COALESCE(m.t_name,'Tournament'), '[^A-Za-z0-9 ]', '', 'g'), 24) || ' '
            || left(regexp_replace(m.round_label, '[^A-Za-z0-9 ]', '', 'g'), 12) || ': ' || v_pref
            || left(regexp_replace(CASE WHEN i IN (1,3) THEN COALESCE(m.b_name,'opponent') ELSE COALESCE(m.a_name,'opponent') END, '[^A-Za-z0-9 ]', '', 'g'), 24)
            || v_when_sms;
      IF p_kind <> 'wa' AND (v_app OR v_email) THEN
        INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
        VALUES (v_to, m.round_label || ' draw', v_msg, 'tournament_round_draw', '/tournaments',
                jsonb_build_object('champ_id', m.champ_id, 'match_id', m.id, 'opponent_name', v_opp, 'partner_name', v_mate,
                                   'play_by', m.deadline, 'scheduling_mode', m.sched_mode, 'fixture_draw_notice', true,
                                   'send_email', v_email, 'app_silent', NOT v_app), false);
        v_count := v_count + 1;
      END IF;
      IF v_wa THEN
        IF p_kind = 'app_email' THEN
          UPDATE public.club_champs_matches SET draw_notice_wa_pending = true WHERE id = m.id AND NOT draw_notice_wa_pending;
        ELSE
          v_out := v_out || jsonb_build_array(jsonb_build_object('member_id', v_to, 'message', v_msg, 'sms', v_sms));
          IF p_kind = 'wa' THEN v_count := v_count + 1; END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('sent', v_count, 'whatsapp', v_out, 'channels', to_jsonb(v_chan));
END $$;

CREATE OR REPLACE FUNCTION public._champ_match_draw_notice_auto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.draw_notice_state = 'auto' THEN
    PERFORM public._champ_fixture_draw_notify(ARRAY[NEW.id], 'app_email');
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_champ_match_draw_notice_state ON public.club_champs_matches;
CREATE TRIGGER trg_champ_match_draw_notice_state BEFORE INSERT OR UPDATE ON public.club_champs_matches
  FOR EACH ROW EXECUTE FUNCTION public._champ_match_draw_notice_state();
DROP TRIGGER IF EXISTS trg_champ_match_draw_notice_auto ON public.club_champs_matches;
CREATE TRIGGER trg_champ_match_draw_notice_auto AFTER INSERT OR UPDATE OF draw_notice_state ON public.club_champs_matches
  FOR EACH ROW WHEN (NEW.draw_notice_state = 'auto') EXECUTE FUNCTION public._champ_match_draw_notice_auto();

REVOKE ALL ON FUNCTION public._champ_fixture_draw_notify(uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._champ_draw_notice_mode(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public._champ_admin_guard(p_champ_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_club uuid;
BEGIN
  SELECT club_id INTO v_club FROM public.club_champs WHERE id = p_champ_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF NOT public.is_club_admin(auth.uid(), v_club) THEN RAISE EXCEPTION 'Not allowed to notify players for this tournament'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.send_champ_fixture_draw_notices(p_champ_id uuid, p_match_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ids uuid[];
BEGIN
  PERFORM public._champ_admin_guard(p_champ_id);
  IF public._champ_draw_notice_mode(p_champ_id) = 'off' THEN RAISE EXCEPTION 'Draw notifications are Off for this tournament'; END IF;
  SELECT array_agg(id) INTO v_ids FROM public.club_champs_matches
   WHERE champ_id = p_champ_id AND (p_match_ids IS NULL OR id = ANY(p_match_ids))
     AND draw_notice_state IN ('pending','dismissed','correction');
  RETURN public._champ_fixture_draw_notify(COALESCE(v_ids, ARRAY[]::uuid[]), 'all');
END $$;

CREATE OR REPLACE FUNCTION public.claim_champ_fixture_wa_notices(p_champ_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ids uuid[];
BEGIN
  PERFORM public._champ_admin_guard(p_champ_id);
  SELECT array_agg(id) INTO v_ids FROM public.club_champs_matches WHERE champ_id = p_champ_id AND draw_notice_wa_pending;
  RETURN public._champ_fixture_draw_notify(COALESCE(v_ids, ARRAY[]::uuid[]), 'wa');
END $$;

CREATE OR REPLACE FUNCTION public.dismiss_champ_fixture_draw_notices(p_champ_id uuid, p_match_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  PERFORM public._champ_admin_guard(p_champ_id);
  UPDATE public.club_champs_matches SET draw_notice_state = 'dismissed'
   WHERE champ_id = p_champ_id AND id = ANY(p_match_ids) AND draw_notice_state IN ('pending','correction');
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.mark_champ_draw_scope_notified(p_champ_id uuid, p_round_number int, p_group_number int DEFAULT NULL, p_stage_key text DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  PERFORM public._champ_admin_guard(p_champ_id);
  UPDATE public.club_champs_matches SET draw_notice_state = 'sent', draw_notice_sent_at = now()
   WHERE champ_id = p_champ_id AND round_number = p_round_number
     AND (p_group_number IS NULL OR group_number = p_group_number)
     AND (p_stage_key IS NULL OR stage_key = p_stage_key)
     AND draw_notice_state IN ('pending','dismissed','correction');
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.send_champ_fixture_draw_notices(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_champ_fixture_wa_notices(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_champ_fixture_draw_notices(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_champ_draw_scope_notified(uuid, int, int, text) TO authenticated;