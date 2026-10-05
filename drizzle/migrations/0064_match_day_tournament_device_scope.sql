-- Match Day device mode for tournaments: the secure link opens the SAME
-- member Tournaments / tournament / marker screens, scoped to one tournament.

CREATE OR REPLACE FUNCTION public.md_hdr_champ()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a match_day_access := public.md_header_access();
BEGIN
  IF a.id IS NULL OR a.competition_kind <> 'tournament' THEN RETURN NULL; END IF;
  RETURN a.competition_id;
END $$;

CREATE OR REPLACE FUNCTION public.md_hdr_champ_open()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _c uuid := public.md_hdr_champ(); w record;
BEGIN
  IF _c IS NULL THEN RETURN false; END IF;
  SELECT * INTO w FROM public.md_window('tournament', _c);
  RETURN CURRENT_DATE BETWEEN w.starts_on AND w.ends_on;
END $$;

CREATE OR REPLACE FUNCTION public.md_hdr_member_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce(array_agg(DISTINCT id), '{}') FROM (
    SELECT club_member_id AS id FROM member_league_registrations
     WHERE club_member_id IS NOT NULL AND league_id = ANY(public.md_hdr_league_ids())
    UNION SELECT player_one_member_id FROM league_team_pairs
     WHERE player_one_member_id IS NOT NULL AND league_id = ANY(public.md_hdr_league_ids())
    UNION SELECT player_two_member_id FROM league_team_pairs
     WHERE player_two_member_id IS NOT NULL AND league_id = ANY(public.md_hdr_league_ids())
    UNION SELECT unnest(ARRAY[r.club_member_id, r.partner_member_id]) FROM club_champs_registrations r WHERE r.champ_id = public.md_hdr_champ()
    UNION SELECT e.club_member_id FROM club_champs_entries e WHERE e.champ_id = public.md_hdr_champ()
    UNION SELECT unnest(ARRAY[m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id])
      FROM club_champs_matches m WHERE m.champ_id = public.md_hdr_champ()
  ) s WHERE id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.md_hdr_user_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce(array_agg(DISTINCT user_id), '{}') FROM club_members WHERE user_id IS NOT NULL AND id = ANY(public.md_hdr_member_ids()) $$;

-- The compatibility view bypasses RLS, so the device gets its own filtered view.
CREATE OR REPLACE VIEW public.md_club_champs AS
  SELECT * FROM public.club_champs WHERE id = public.md_hdr_champ();
GRANT SELECT ON public.md_club_champs TO anon;

-- Reads
GRANT SELECT ON public.tournaments, public.tournament_rules, public.club_champs_matches, public.club_champs_entries,
  public.club_champs_registrations, public.club_champs_rounds, public.champ_marker_locks, public.team_league_events TO anon;
GRANT UPDATE ON public.club_champs_matches TO anon;
GRANT INSERT, UPDATE, DELETE ON public.champ_marker_locks TO anon;
GRANT SELECT (user_id) ON public.club_members TO anon;
GRANT SELECT (id, name, avatar_url) ON public.profiles TO anon;

CREATE POLICY "md device read tournament" ON public.tournaments FOR SELECT TO anon USING (id = (SELECT public.md_hdr_champ()));
CREATE POLICY "md device read tournament rules" ON public.tournament_rules FOR SELECT TO anon USING (tournament_id = (SELECT public.md_hdr_champ()));
CREATE POLICY "md device read champ matches" ON public.club_champs_matches FOR SELECT TO anon USING (champ_id = (SELECT public.md_hdr_champ()));
CREATE POLICY "md device read champ entries" ON public.club_champs_entries FOR SELECT TO anon USING (champ_id = (SELECT public.md_hdr_champ()));
CREATE POLICY "md device read champ registrations" ON public.club_champs_registrations FOR SELECT TO anon USING (champ_id = (SELECT public.md_hdr_champ()));
CREATE POLICY "md device read champ rounds" ON public.club_champs_rounds FOR SELECT TO anon USING (champ_id = (SELECT public.md_hdr_champ()));
CREATE POLICY "md device read team league event" ON public.team_league_events FOR SELECT TO anon USING (tournament_id = (SELECT public.md_hdr_champ()));
CREATE POLICY "md device read champ locks" ON public.champ_marker_locks FOR SELECT TO anon
  USING (match_id IN (SELECT id FROM club_champs_matches WHERE champ_id = (SELECT public.md_hdr_champ())));
CREATE POLICY "md device read profiles" ON public.profiles FOR SELECT TO anon USING (id = ANY((SELECT public.md_hdr_user_ids())::uuid[]));

-- Writes: only open (not finished) games of this tournament while the window is open.
CREATE POLICY "md device score champ matches" ON public.club_champs_matches FOR UPDATE TO anon
  USING (champ_id = (SELECT public.md_hdr_champ()) AND (SELECT public.md_hdr_champ_open())
         AND (coalesce(lower(status),'') NOT IN ('completed','forfeited','walkover','cancelled') OR updated_at > now() - interval '2 minutes'))
  WITH CHECK (champ_id = (SELECT public.md_hdr_champ()));
CREATE POLICY "md device write champ locks" ON public.champ_marker_locks FOR ALL TO anon
  USING ((SELECT public.md_hdr_champ_open()) AND match_id IN (SELECT id FROM club_champs_matches WHERE champ_id = (SELECT public.md_hdr_champ())))
  WITH CHECK ((SELECT public.md_hdr_champ_open()) AND match_id IN (SELECT id FROM club_champs_matches WHERE champ_id = (SELECT public.md_hdr_champ())));

-- A secure link may only change the score of a game, never who plays, where or when.
CREATE OR REPLACE FUNCTION public.md_guard_champ_match_update()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), 'anon') <> 'anon' THEN RETURN NEW; END IF;
  IF NEW.champ_id IS DISTINCT FROM OLD.champ_id
     OR NEW.player_a_member_id IS DISTINCT FROM OLD.player_a_member_id
     OR NEW.player_b_member_id IS DISTINCT FROM OLD.player_b_member_id
     OR NEW.partner_a_member_id IS DISTINCT FROM OLD.partner_a_member_id
     OR NEW.partner_b_member_id IS DISTINCT FROM OLD.partner_b_member_id
     OR NEW.group_number IS DISTINCT FROM OLD.group_number
     OR NEW.round_number IS DISTINCT FROM OLD.round_number
     OR NEW.court_id IS DISTINCT FROM OLD.court_id
     OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
     OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time THEN
    RAISE EXCEPTION 'A Match Day link can only record scores' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER md_guard_champ_match_update BEFORE UPDATE ON public.club_champs_matches
  FOR EACH ROW EXECUTE FUNCTION public.md_guard_champ_match_update();

-- Audit result-level changes (not every live point) made through a link.
CREATE TRIGGER md_audit_champ_match AFTER UPDATE ON public.club_champs_matches
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.winner_member_id IS DISTINCT FROM NEW.winner_member_id OR OLD.score IS DISTINCT FROM NEW.score)
  EXECUTE FUNCTION public.md_audit_device_write();

-- Shared visibility helper: a valid tournament link may view its own tournament.
CREATE OR REPLACE FUNCTION public.can_view_tournament(_user_id uuid, _tournament_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (_user_id IS NULL AND _tournament_id = public.md_hdr_champ()) OR EXISTS (
    SELECT 1 FROM public.tournaments t
     WHERE t.id = _tournament_id
       AND (
         public.is_club_member(_user_id, t.club_id)
         OR public.can_manage_tournament(_user_id, t.id)
         OR EXISTS (SELECT 1 FROM public.tournament_rules r
                     WHERE r.tournament_id = t.id AND r.scoring_mode = 'time_capped_points')
         OR EXISTS (
              SELECT 1 FROM public.club_champs_registrations reg
              JOIN public.club_members cm ON cm.id IN (reg.club_member_id, reg.partner_member_id)
              WHERE reg.champ_id = t.id AND cm.user_id = _user_id
            )
         OR EXISTS (
              SELECT 1 FROM public.club_champs_entries e
              JOIN public.club_members cm2 ON cm2.id = e.club_member_id
              WHERE e.champ_id = t.id AND cm2.user_id = _user_id
            )
       )
  );
$function$;

CREATE OR REPLACE FUNCTION public.tournament_member_names(p_champ_id uuid)
 RETURNS TABLE(id uuid, name text, club_member_number text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT ((auth.uid() IS NOT NULL AND public.can_view_tournament(auth.uid(), p_champ_id))
          OR (auth.uid() IS NULL AND p_champ_id = public.md_hdr_champ())) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT cm.id, COALESCE(NULLIF(cm.name,''), pr.name)::text, cm.club_member_number::text
  FROM public.club_members cm
  LEFT JOIN public.profiles pr ON pr.id = cm.user_id
  WHERE cm.id IN (
    SELECT r.club_member_id FROM public.club_champs_registrations r WHERE r.champ_id = p_champ_id
    UNION SELECT r.partner_member_id FROM public.club_champs_registrations r WHERE r.champ_id = p_champ_id
    UNION SELECT m.player_a_member_id FROM public.club_champs_matches m WHERE m.champ_id = p_champ_id
    UNION SELECT m.player_b_member_id FROM public.club_champs_matches m WHERE m.champ_id = p_champ_id
    UNION SELECT m.partner_a_member_id FROM public.club_champs_matches m WHERE m.champ_id = p_champ_id
    UNION SELECT m.partner_b_member_id FROM public.club_champs_matches m WHERE m.champ_id = p_champ_id
  );
END $function$;
GRANT EXECUTE ON FUNCTION public.tournament_member_names(uuid) TO anon;

CREATE OR REPLACE FUNCTION public.save_marker_match_result(_match_id uuid, _club_id uuid, _player_a_member_id uuid, _player_b_member_id uuid, _winner_member_id uuid, _score text, _game_scores text, _duration_s integer, _confirmed boolean, _notes text, _tournament_match_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _champ uuid;
  _allowed boolean := false;
  _existing uuid;
  _device boolean := false;
BEGIN
  IF _uid IS NULL THEN
    -- Secure Match Day link: only a game of its own tournament, while open.
    IF _tournament_match_id IS NOT NULL AND public.md_hdr_champ_open() THEN
      SELECT champ_id INTO _champ FROM public.club_champs_matches WHERE id = _tournament_match_id;
      IF _champ IS NOT NULL AND _champ = public.md_hdr_champ() THEN
        _allowed := true; _device := true;
        SELECT club_id INTO _club_id FROM public.tournaments WHERE id = _champ;
      END IF;
    END IF;
    IF NOT _allowed THEN
      RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
    END IF;
  ELSIF _club_id IS NOT NULL AND public.is_club_member(_uid, _club_id) THEN
    _allowed := true;
  ELSIF _club_id IS NOT NULL AND public.is_club_admin(_uid, _club_id) THEN
    _allowed := true;
  ELSIF public.has_role(_uid, 'admin'::app_role) THEN
    _allowed := true;
  ELSIF _player_a_member_id IS NOT NULL AND public.is_member_owner(_player_a_member_id) THEN
    _allowed := true;
  ELSIF _player_b_member_id IS NOT NULL AND public.is_member_owner(_player_b_member_id) THEN
    _allowed := true;
  ELSIF _tournament_match_id IS NOT NULL THEN
    SELECT champ_id INTO _champ FROM public.club_champs_matches WHERE id = _tournament_match_id;
    IF _champ IS NOT NULL AND public.can_manage_tournament(_uid, _champ) THEN
      _allowed := true;
    END IF;
  END IF;

  IF NOT _allowed THEN
    RAISE EXCEPTION 'You are not allowed to record a result for this club'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _existing FROM public.matches WHERE id = _match_id;

  IF _existing IS NULL THEN
    INSERT INTO public.matches (
      id, player_a_member_id, player_b_member_id, winner_member_id,
      score, game_scores, duration_s, submitted_by, confirmed, notes, club_id
    ) VALUES (
      _match_id, _player_a_member_id, _player_b_member_id, _winner_member_id,
      _score, _game_scores, _duration_s, _uid, CASE WHEN _device THEN true ELSE COALESCE(_confirmed, false) END,
      CASE WHEN _device THEN coalesce(_notes,'') || '. Marked via Match Day Access link' ELSE _notes END, _club_id
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF _tournament_match_id IS NOT NULL THEN
    UPDATE public.club_champs_matches
       SET score = _score,
           game_scores = _game_scores,
           winner_member_id = _winner_member_id,
           status = 'completed'
     WHERE id = _tournament_match_id
       AND status <> 'completed';
  END IF;

  RETURN _match_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.save_marker_match_result(uuid, uuid, uuid, uuid, uuid, text, text, integer, boolean, text, uuid) TO anon;