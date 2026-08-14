-- =========================================================
-- One tournament platform: engine / governance / rules / venues
-- =========================================================

-- 1. Rename engine table ------------------------------------------------
ALTER TABLE public.club_champs RENAME TO tournaments;

ALTER TABLE public.tournaments
  ADD COLUMN owner_org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL;

UPDATE public.tournaments t
   SET owner_org_id = o.id
  FROM public.organisations o
 WHERE o.club_id = t.club_id;

CREATE INDEX IF NOT EXISTS idx_tournaments_owner_org ON public.tournaments(owner_org_id);

-- 2. Governance ---------------------------------------------------------
CREATE TABLE public.tournament_governance (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  sanction_status text NOT NULL DEFAULT 'none',
  sanctioning_org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  sanction_reference text,
  sanction_notes text,
  sanctioned_at timestamptz,
  sanctioned_by uuid,
  competition_level text NOT NULL DEFAULT 'club',
  eligibility_min_age integer,
  eligibility_max_age integer,
  eligibility_requires_licence boolean NOT NULL DEFAULT false,
  eligibility_scope text NOT NULL DEFAULT 'club',
  eligibility_notes text,
  registration_required boolean NOT NULL DEFAULT true,
  registration_mode text NOT NULL DEFAULT 'open',
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  entry_fee_cents integer NOT NULL DEFAULT 0,
  federation_fee_cents integer NOT NULL DEFAULT 0,
  association_fee_cents integer NOT NULL DEFAULT 0,
  payment_methods text[] NOT NULL DEFAULT ARRAY['card'::text],
  payment_required boolean NOT NULL DEFAULT true,
  refund_policy text NOT NULL DEFAULT 'none',
  refund_cutoff_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tg_sanction_status_check CHECK (sanction_status IN ('none','pending','approved','rejected')),
  CONSTRAINT tg_competition_level_check CHECK (competition_level IN ('club','regional','provincial','national')),
  CONSTRAINT tg_eligibility_scope_check CHECK (eligibility_scope IN ('club','association','open')),
  CONSTRAINT tg_registration_mode_check CHECK (registration_mode IN ('open','invite')),
  CONSTRAINT tg_refund_policy_check CHECK (refund_policy IN ('none','full_before_cutoff','partial_before_cutoff')),
  CONSTRAINT tg_fees_check CHECK (entry_fee_cents >= 0 AND federation_fee_cents >= 0 AND association_fee_cents >= 0)
);

INSERT INTO public.tournament_governance (
  tournament_id, sanction_status, sanctioning_org_id, sanction_reference, sanction_notes,
  sanctioned_at, sanctioned_by, competition_level, eligibility_min_age, eligibility_max_age,
  eligibility_requires_licence, eligibility_scope, eligibility_notes, registration_required,
  registration_mode, registration_opens_at, registration_closes_at, entry_fee_cents,
  federation_fee_cents, association_fee_cents, payment_methods, payment_required,
  refund_policy, refund_cutoff_date)
SELECT id, sanction_status, sanctioning_org_id, sanction_reference, sanction_notes,
       sanctioned_at, sanctioned_by, competition_level, eligibility_min_age, eligibility_max_age,
       eligibility_requires_licence, eligibility_scope, eligibility_notes, registration_required,
       registration_mode, registration_opens_at, registration_closes_at, entry_fee_cents,
       federation_fee_cents, association_fee_cents, payment_methods, payment_required,
       refund_policy, refund_cutoff_date
  FROM public.tournaments;

-- 3. Rules --------------------------------------------------------------
CREATE TABLE public.tournament_rules (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  scoring_mode text NOT NULL DEFAULT 'standard',
  draw_type text NOT NULL DEFAULT 'round_robin',
  standard_of_play text NOT NULL DEFAULT 'open',
  round_format text NOT NULL DEFAULT 'single_round_robin',
  best_of smallint DEFAULT 5,
  points_per_game smallint NOT NULL DEFAULT 11,
  win_condition text NOT NULL DEFAULT 'win_by_2',
  handicap_mode text NOT NULL DEFAULT 'none',
  handicap_multiplier numeric NOT NULL DEFAULT 1,
  handicap_divider numeric NOT NULL DEFAULT 1,
  bye_handling text NOT NULL DEFAULT 'no_match',
  play_all_games boolean NOT NULL DEFAULT false,
  affects_ranking_points boolean NOT NULL DEFAULT false,
  no_show_opponent_points integer NOT NULL DEFAULT 10,
  no_show_player_points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tr_scoring_mode_check CHECK (scoring_mode IN ('standard','time_capped_points','swiss')),
  CONSTRAINT tr_draw_type_check CHECK (draw_type IN ('round_robin','groups_playoffs','swiss','knockout','monrad')),
  CONSTRAINT tr_round_format_check CHECK (round_format IN ('single_round_robin','double_round_robin','cross_league','swiss')),
  CONSTRAINT tr_best_of_check CHECK (best_of IS NULL OR best_of IN (1,3,5)),
  CONSTRAINT tr_points_per_game_check CHECK (points_per_game IN (11,15)),
  CONSTRAINT tr_handicap_mode_check CHECK (handicap_mode IN ('none','league_rank','group_order','club_ladder','ladder_history')),
  CONSTRAINT tr_bye_handling_check CHECK (bye_handling IN ('no_match','walkover_win','neutral'))
);

INSERT INTO public.tournament_rules (
  tournament_id, scoring_mode, draw_type, standard_of_play, round_format, best_of,
  points_per_game, win_condition, handicap_mode, handicap_multiplier, handicap_divider,
  bye_handling, play_all_games, affects_ranking_points, no_show_opponent_points, no_show_player_points)
SELECT id,
       scoring_mode,
       CASE WHEN scoring_mode = 'swiss' OR round_format = 'swiss' THEN 'swiss'
            WHEN enable_playoffs THEN 'groups_playoffs'
            ELSE 'round_robin' END,
       'open',
       round_format, best_of, points_per_game, win_condition, handicap_mode,
       handicap_multiplier, handicap_divider, bye_handling, play_all_games,
       affects_ranking_points, no_show_opponent_points, no_show_player_points
  FROM public.tournaments;

-- 4. Venues & host compensation ----------------------------------------
CREATE TABLE public.tournament_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  court_ids integer[] NOT NULL DEFAULT '{}',
  is_primary boolean NOT NULL DEFAULT false,
  host_fee_cents integer NOT NULL DEFAULT 0,
  host_share_pct numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, club_id),
  CONSTRAINT tv_host_fee_check CHECK (host_fee_cents >= 0),
  CONSTRAINT tv_host_share_check CHECK (host_share_pct >= 0 AND host_share_pct <= 100)
);

INSERT INTO public.tournament_venues (tournament_id, club_id, court_ids, is_primary)
SELECT id, club_id, court_ids, true FROM public.tournaments;

-- 5. Drop the moved columns from the engine table ----------------------
ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS club_champs_scoring_mode_check,
  DROP CONSTRAINT IF EXISTS club_champs_round_format_check,
  DROP CONSTRAINT IF EXISTS club_champs_best_of_check,
  DROP CONSTRAINT IF EXISTS club_champs_points_per_game_check,
  DROP CONSTRAINT IF EXISTS club_champs_handicap_mode_check,
  DROP CONSTRAINT IF EXISTS club_champs_bye_handling_check,
  DROP CONSTRAINT IF EXISTS club_champs_registration_mode_check,
  DROP CONSTRAINT IF EXISTS club_champs_entry_fee_cents_check,
  DROP CONSTRAINT IF EXISTS club_champs_governance_fees_check,
  DROP CONSTRAINT IF EXISTS club_champs_sanction_status_check,
  DROP CONSTRAINT IF EXISTS club_champs_competition_level_check,
  DROP CONSTRAINT IF EXISTS club_champs_eligibility_scope_check,
  DROP CONSTRAINT IF EXISTS club_champs_refund_policy_check;

DROP POLICY IF EXISTS "Signed-in users can view Bells champs" ON public.tournaments;
DROP POLICY IF EXISTS "Signed-in users can view Bells champ entries" ON public.club_champs_entries;
DROP POLICY IF EXISTS "Signed-in users can view Bells champ matches" ON public.club_champs_matches;

ALTER TABLE public.tournaments
  DROP COLUMN sanction_status,
  DROP COLUMN sanctioning_org_id,
  DROP COLUMN sanction_reference,
  DROP COLUMN sanction_notes,
  DROP COLUMN sanctioned_at,
  DROP COLUMN sanctioned_by,
  DROP COLUMN competition_level,
  DROP COLUMN eligibility_min_age,
  DROP COLUMN eligibility_max_age,
  DROP COLUMN eligibility_requires_licence,
  DROP COLUMN eligibility_scope,
  DROP COLUMN eligibility_notes,
  DROP COLUMN registration_required,
  DROP COLUMN registration_mode,
  DROP COLUMN registration_opens_at,
  DROP COLUMN registration_closes_at,
  DROP COLUMN entry_fee_cents,
  DROP COLUMN federation_fee_cents,
  DROP COLUMN association_fee_cents,
  DROP COLUMN payment_methods,
  DROP COLUMN payment_required,
  DROP COLUMN refund_policy,
  DROP COLUMN refund_cutoff_date,
  DROP COLUMN scoring_mode,
  DROP COLUMN round_format,
  DROP COLUMN best_of,
  DROP COLUMN points_per_game,
  DROP COLUMN win_condition,
  DROP COLUMN handicap_mode,
  DROP COLUMN handicap_multiplier,
  DROP COLUMN handicap_divider,
  DROP COLUMN bye_handling,
  DROP COLUMN play_all_games,
  DROP COLUMN affects_ranking_points,
  DROP COLUMN no_show_opponent_points,
  DROP COLUMN no_show_player_points;

-- 6. Permissions --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_tournament(_user_id uuid, _tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tournaments t
      LEFT JOIN public.organisations o ON o.id = t.owner_org_id
     WHERE t.id = _tournament_id
       AND (
         public.is_platform_admin(_user_id)
         OR public.is_club_admin_or_permitted(_user_id, t.club_id, 'champs')
         OR (o.id IS NOT NULL AND (
              public.has_org_role(_user_id, o.id, 'super_admin'::org_admin_role)
           OR public.has_org_role(_user_id, o.id, 'competition_admin'::org_admin_role)
           OR public.has_org_role(_user_id, o.id, 'tournament_director'::org_admin_role)
           OR public.has_org_role(_user_id, o.id, 'association_admin'::org_admin_role)
         ))
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_tournament(_user_id uuid, _tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
     WHERE t.id = _tournament_id
       AND (
         public.is_club_member(_user_id, t.club_id)
         OR public.can_manage_tournament(_user_id, t.id)
         OR EXISTS (SELECT 1 FROM public.tournament_rules r
                     WHERE r.tournament_id = t.id AND r.scoring_mode = 'time_capped_points')
       )
  );
$$;

CREATE POLICY "Signed-in users can view open-format tournaments"
  ON public.tournaments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournament_rules r
                  WHERE r.tournament_id = tournaments.id
                    AND r.scoring_mode = 'time_capped_points'));

CREATE POLICY "Owning body officers manage tournaments"
  ON public.tournaments FOR ALL TO authenticated
  USING (public.can_manage_tournament(auth.uid(), id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), id));

CREATE POLICY "Signed-in users can view Bells champ entries"
  ON public.club_champs_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournament_rules r
                  WHERE r.tournament_id = club_champs_entries.champ_id
                    AND r.scoring_mode = 'time_capped_points'));

CREATE POLICY "Signed-in users can view Bells champ matches"
  ON public.club_champs_matches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournament_rules r
                  WHERE r.tournament_id = club_champs_matches.champ_id
                    AND r.scoring_mode = 'time_capped_points'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_governance TO authenticated;
GRANT ALL ON public.tournament_governance TO service_role;
ALTER TABLE public.tournament_governance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View tournament governance" ON public.tournament_governance
  FOR SELECT TO authenticated USING (public.can_view_tournament(auth.uid(), tournament_id));
CREATE POLICY "Manage tournament governance" ON public.tournament_governance
  FOR ALL TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_rules TO authenticated;
GRANT ALL ON public.tournament_rules TO service_role;
ALTER TABLE public.tournament_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View tournament rules" ON public.tournament_rules
  FOR SELECT TO authenticated USING (public.can_view_tournament(auth.uid(), tournament_id));
CREATE POLICY "Manage tournament rules" ON public.tournament_rules
  FOR ALL TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_venues TO authenticated;
GRANT ALL ON public.tournament_venues TO service_role;
ALTER TABLE public.tournament_venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View tournament venues" ON public.tournament_venues
  FOR SELECT TO authenticated USING (public.can_view_tournament(auth.uid(), tournament_id));
CREATE POLICY "Manage tournament venues" ON public.tournament_venues
  FOR ALL TO authenticated
  USING (public.can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));

CREATE TRIGGER update_tournament_governance_updated_at BEFORE UPDATE ON public.tournament_governance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tournament_rules_updated_at BEFORE UPDATE ON public.tournament_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tournament_venues_updated_at BEFORE UPDATE ON public.tournament_venues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Auto-create governance/rules/venue rows for new tournaments --------
CREATE OR REPLACE FUNCTION public.ensure_tournament_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tournament_governance (tournament_id) VALUES (NEW.id)
    ON CONFLICT (tournament_id) DO NOTHING;
  INSERT INTO public.tournament_rules (tournament_id) VALUES (NEW.id)
    ON CONFLICT (tournament_id) DO NOTHING;
  INSERT INTO public.tournament_venues (tournament_id, club_id, court_ids, is_primary)
    VALUES (NEW.id, NEW.club_id, COALESCE(NEW.court_ids, '{}'), true)
    ON CONFLICT (tournament_id, club_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_tournament_children
  AFTER INSERT ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.ensure_tournament_children();

-- 8. Audit now lives on the governance table ---------------------------
DROP TRIGGER IF EXISTS trg_log_tournament_governance ON public.tournaments;

CREATE OR REPLACE FUNCTION public.log_tournament_governance_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f text;
  oldv text;
  newv text;
  cid uuid;
  fields text[] := ARRAY[
    'sanction_status','sanctioning_org_id','sanction_reference','sanction_notes',
    'competition_level','eligibility_min_age','eligibility_max_age',
    'eligibility_requires_licence','eligibility_scope','eligibility_notes',
    'registration_required','registration_mode','registration_opens_at','registration_closes_at',
    'entry_fee_cents','federation_fee_cents','association_fee_cents',
    'payment_required','refund_policy','refund_cutoff_date'
  ];
BEGIN
  SELECT club_id INTO cid FROM public.tournaments WHERE id = NEW.tournament_id;
  FOREACH f IN ARRAY fields LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f)
      INTO oldv, newv USING OLD, NEW;
    IF oldv IS DISTINCT FROM newv THEN
      INSERT INTO public.tournament_governance_audit (champ_id, club_id, field, old_value, new_value, changed_by)
      VALUES (NEW.tournament_id, cid, f, oldv, newv, auth.uid());
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_tournament_governance
  AFTER UPDATE ON public.tournament_governance
  FOR EACH ROW EXECUTE FUNCTION public.log_tournament_governance_changes();

-- 9. Compatibility view so existing screens keep working ---------------
CREATE VIEW public.club_champs
WITH (security_invoker = true) AS
SELECT
  t.id, t.club_id, t.owner_org_id, t.name, t.gender, t.status, t.num_groups,
  t.start_date, t.end_date, t.play_days, t.start_time, t.end_time,
  t.match_duration_minutes, t.created_at, t.updated_at, t.match_type,
  t.enable_playoffs, t.source_league_id, t.source_league_ids, t.partner_mode,
  t.entries_locked, t.invite_methods, t.description, t.group_durations,
  t.include_visitors, t.visitor_clubs, t.day_schedules, t.court_ids,
  t.court_rotation_minutes, t.group_break_minutes, t.default_break_minutes,
  t.invite_source, t.invite_include_reserves, t.invite_excluded_member_ids,
  t.group_labels, t.swiss_pools, t.swiss_rounds, t.avoid_back_to_back,
  t.schedule_mode, t.playoff_break_minutes, t.playoff_date, t.league_formats,
  t.expected_players,
  g.sanction_status, g.sanctioning_org_id, g.sanction_reference, g.sanction_notes,
  g.sanctioned_at, g.sanctioned_by, g.competition_level, g.eligibility_min_age,
  g.eligibility_max_age, g.eligibility_requires_licence, g.eligibility_scope,
  g.eligibility_notes, g.registration_required, g.registration_mode,
  g.registration_opens_at, g.registration_closes_at, g.entry_fee_cents,
  g.federation_fee_cents, g.association_fee_cents, g.payment_methods,
  g.payment_required, g.refund_policy, g.refund_cutoff_date,
  r.scoring_mode, r.draw_type, r.standard_of_play, r.round_format, r.best_of,
  r.points_per_game, r.win_condition, r.handicap_mode, r.handicap_multiplier,
  r.handicap_divider, r.bye_handling, r.play_all_games, r.affects_ranking_points,
  r.no_show_opponent_points, r.no_show_player_points
FROM public.tournaments t
LEFT JOIN public.tournament_governance g ON g.tournament_id = t.id
LEFT JOIN public.tournament_rules r ON r.tournament_id = t.id;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_champs TO authenticated;
GRANT ALL ON public.club_champs TO service_role;

CREATE OR REPLACE FUNCTION public.club_champs_compat_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.tournaments (
    id, club_id, owner_org_id, name, gender, status, num_groups, start_date, end_date,
    play_days, start_time, end_time, match_duration_minutes, match_type, enable_playoffs,
    source_league_id, source_league_ids, partner_mode, entries_locked, invite_methods,
    description, group_durations, include_visitors, visitor_clubs, day_schedules,
    court_ids, court_rotation_minutes, group_break_minutes, default_break_minutes,
    invite_source, invite_include_reserves, invite_excluded_member_ids, group_labels,
    swiss_pools, swiss_rounds, avoid_back_to_back, schedule_mode, playoff_break_minutes,
    playoff_date, league_formats, expected_players
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.club_id,
    COALESCE(NEW.owner_org_id, (SELECT o.id FROM public.organisations o WHERE o.club_id = NEW.club_id)),
    NEW.name, NEW.gender, COALESCE(NEW.status,'planning'), COALESCE(NEW.num_groups,2),
    NEW.start_date, NEW.end_date, COALESCE(NEW.play_days,'{}'), COALESCE(NEW.start_time,'18:00'),
    COALESCE(NEW.end_time,'20:00'), COALESCE(NEW.match_duration_minutes,30),
    COALESCE(NEW.match_type,'singles'), COALESCE(NEW.enable_playoffs,false),
    NEW.source_league_id, COALESCE(NEW.source_league_ids,'{}'), COALESCE(NEW.partner_mode,'admin'),
    COALESCE(NEW.entries_locked,false), COALESCE(NEW.invite_methods, ARRAY['app'::text]),
    NEW.description, COALESCE(NEW.group_durations,'{}'::jsonb), COALESCE(NEW.include_visitors,false),
    COALESCE(NEW.visitor_clubs,'{}'), COALESCE(NEW.day_schedules,'[]'::jsonb),
    COALESCE(NEW.court_ids,'{}'), NEW.court_rotation_minutes,
    COALESCE(NEW.group_break_minutes,'{}'::jsonb), COALESCE(NEW.default_break_minutes,0),
    COALESCE(NEW.invite_source,'manual'), COALESCE(NEW.invite_include_reserves,true),
    COALESCE(NEW.invite_excluded_member_ids,'{}'), NEW.group_labels, NEW.swiss_pools,
    NEW.swiss_rounds, COALESCE(NEW.avoid_back_to_back,true), COALESCE(NEW.schedule_mode,'spread'),
    COALESCE(NEW.playoff_break_minutes,0), NEW.playoff_date, NEW.league_formats, NEW.expected_players
  ) RETURNING id INTO new_id;

  UPDATE public.tournament_governance SET
    sanction_status = COALESCE(NEW.sanction_status, sanction_status),
    sanctioning_org_id = COALESCE(NEW.sanctioning_org_id, sanctioning_org_id),
    sanction_reference = COALESCE(NEW.sanction_reference, sanction_reference),
    sanction_notes = COALESCE(NEW.sanction_notes, sanction_notes),
    competition_level = COALESCE(NEW.competition_level, competition_level),
    eligibility_min_age = COALESCE(NEW.eligibility_min_age, eligibility_min_age),
    eligibility_max_age = COALESCE(NEW.eligibility_max_age, eligibility_max_age),
    eligibility_requires_licence = COALESCE(NEW.eligibility_requires_licence, eligibility_requires_licence),
    eligibility_scope = COALESCE(NEW.eligibility_scope, eligibility_scope),
    eligibility_notes = COALESCE(NEW.eligibility_notes, eligibility_notes),
    registration_required = COALESCE(NEW.registration_required, registration_required),
    registration_mode = COALESCE(NEW.registration_mode, registration_mode),
    registration_opens_at = COALESCE(NEW.registration_opens_at, registration_opens_at),
    registration_closes_at = COALESCE(NEW.registration_closes_at, registration_closes_at),
    entry_fee_cents = COALESCE(NEW.entry_fee_cents, entry_fee_cents),
    federation_fee_cents = COALESCE(NEW.federation_fee_cents, federation_fee_cents),
    association_fee_cents = COALESCE(NEW.association_fee_cents, association_fee_cents),
    payment_methods = COALESCE(NEW.payment_methods, payment_methods),
    payment_required = COALESCE(NEW.payment_required, payment_required),
    refund_policy = COALESCE(NEW.refund_policy, refund_policy),
    refund_cutoff_date = COALESCE(NEW.refund_cutoff_date, refund_cutoff_date)
  WHERE tournament_id = new_id;

  UPDATE public.tournament_rules SET
    scoring_mode = COALESCE(NEW.scoring_mode, scoring_mode),
    draw_type = COALESCE(NEW.draw_type, draw_type),
    standard_of_play = COALESCE(NEW.standard_of_play, standard_of_play),
    round_format = COALESCE(NEW.round_format, round_format),
    best_of = COALESCE(NEW.best_of, best_of),
    points_per_game = COALESCE(NEW.points_per_game, points_per_game),
    win_condition = COALESCE(NEW.win_condition, win_condition),
    handicap_mode = COALESCE(NEW.handicap_mode, handicap_mode),
    handicap_multiplier = COALESCE(NEW.handicap_multiplier, handicap_multiplier),
    handicap_divider = COALESCE(NEW.handicap_divider, handicap_divider),
    bye_handling = COALESCE(NEW.bye_handling, bye_handling),
    play_all_games = COALESCE(NEW.play_all_games, play_all_games),
    affects_ranking_points = COALESCE(NEW.affects_ranking_points, affects_ranking_points),
    no_show_opponent_points = COALESCE(NEW.no_show_opponent_points, no_show_opponent_points),
    no_show_player_points = COALESCE(NEW.no_show_player_points, no_show_player_points)
  WHERE tournament_id = new_id;

  SELECT * INTO NEW FROM public.club_champs WHERE id = new_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.club_champs_compat_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tournaments SET
    club_id = NEW.club_id, owner_org_id = NEW.owner_org_id, name = NEW.name,
    gender = NEW.gender, status = NEW.status, num_groups = NEW.num_groups,
    start_date = NEW.start_date, end_date = NEW.end_date, play_days = NEW.play_days,
    start_time = NEW.start_time, end_time = NEW.end_time,
    match_duration_minutes = NEW.match_duration_minutes, match_type = NEW.match_type,
    enable_playoffs = NEW.enable_playoffs, source_league_id = NEW.source_league_id,
    source_league_ids = NEW.source_league_ids, partner_mode = NEW.partner_mode,
    entries_locked = NEW.entries_locked, invite_methods = NEW.invite_methods,
    description = NEW.description, group_durations = NEW.group_durations,
    include_visitors = NEW.include_visitors, visitor_clubs = NEW.visitor_clubs,
    day_schedules = NEW.day_schedules, court_ids = NEW.court_ids,
    court_rotation_minutes = NEW.court_rotation_minutes,
    group_break_minutes = NEW.group_break_minutes,
    default_break_minutes = NEW.default_break_minutes, invite_source = NEW.invite_source,
    invite_include_reserves = NEW.invite_include_reserves,
    invite_excluded_member_ids = NEW.invite_excluded_member_ids,
    group_labels = NEW.group_labels, swiss_pools = NEW.swiss_pools,
    swiss_rounds = NEW.swiss_rounds, avoid_back_to_back = NEW.avoid_back_to_back,
    schedule_mode = NEW.schedule_mode, playoff_break_minutes = NEW.playoff_break_minutes,
    playoff_date = NEW.playoff_date, league_formats = NEW.league_formats,
    expected_players = NEW.expected_players
  WHERE id = OLD.id;

  UPDATE public.tournament_governance SET
    sanction_status = COALESCE(NEW.sanction_status, sanction_status),
    sanctioning_org_id = NEW.sanctioning_org_id,
    sanction_reference = NEW.sanction_reference,
    sanction_notes = NEW.sanction_notes,
    competition_level = COALESCE(NEW.competition_level, competition_level),
    eligibility_min_age = NEW.eligibility_min_age,
    eligibility_max_age = NEW.eligibility_max_age,
    eligibility_requires_licence = COALESCE(NEW.eligibility_requires_licence, eligibility_requires_licence),
    eligibility_scope = COALESCE(NEW.eligibility_scope, eligibility_scope),
    eligibility_notes = NEW.eligibility_notes,
    registration_required = COALESCE(NEW.registration_required, registration_required),
    registration_mode = COALESCE(NEW.registration_mode, registration_mode),
    registration_opens_at = NEW.registration_opens_at,
    registration_closes_at = NEW.registration_closes_at,
    entry_fee_cents = COALESCE(NEW.entry_fee_cents, entry_fee_cents),
    federation_fee_cents = COALESCE(NEW.federation_fee_cents, federation_fee_cents),
    association_fee_cents = COALESCE(NEW.association_fee_cents, association_fee_cents),
    payment_methods = COALESCE(NEW.payment_methods, payment_methods),
    payment_required = COALESCE(NEW.payment_required, payment_required),
    refund_policy = COALESCE(NEW.refund_policy, refund_policy),
    refund_cutoff_date = NEW.refund_cutoff_date
  WHERE tournament_id = OLD.id;

  UPDATE public.tournament_rules SET
    scoring_mode = COALESCE(NEW.scoring_mode, scoring_mode),
    draw_type = COALESCE(NEW.draw_type, draw_type),
    standard_of_play = COALESCE(NEW.standard_of_play, standard_of_play),
    round_format = COALESCE(NEW.round_format, round_format),
    best_of = NEW.best_of,
    points_per_game = COALESCE(NEW.points_per_game, points_per_game),
    win_condition = COALESCE(NEW.win_condition, win_condition),
    handicap_mode = COALESCE(NEW.handicap_mode, handicap_mode),
    handicap_multiplier = COALESCE(NEW.handicap_multiplier, handicap_multiplier),
    handicap_divider = COALESCE(NEW.handicap_divider, handicap_divider),
    bye_handling = COALESCE(NEW.bye_handling, bye_handling),
    play_all_games = COALESCE(NEW.play_all_games, play_all_games),
    affects_ranking_points = COALESCE(NEW.affects_ranking_points, affects_ranking_points),
    no_show_opponent_points = COALESCE(NEW.no_show_opponent_points, no_show_opponent_points),
    no_show_player_points = COALESCE(NEW.no_show_player_points, no_show_player_points)
  WHERE tournament_id = OLD.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.club_champs_compat_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tournaments WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER club_champs_compat_insert_trg INSTEAD OF INSERT ON public.club_champs
  FOR EACH ROW EXECUTE FUNCTION public.club_champs_compat_insert();
CREATE TRIGGER club_champs_compat_update_trg INSTEAD OF UPDATE ON public.club_champs
  FOR EACH ROW EXECUTE FUNCTION public.club_champs_compat_update();
CREATE TRIGGER club_champs_compat_delete_trg INSTEAD OF DELETE ON public.club_champs
  FOR EACH ROW EXECUTE FUNCTION public.club_champs_compat_delete();