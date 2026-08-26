-- 1. Audit trail for post-play participant corrections
CREATE TABLE IF NOT EXISTS public.league_participant_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES public.platform_league_fixtures(id) ON DELETE CASCADE,
  position integer NOT NULL,
  side text NOT NULL CHECK (side IN ('home','away')),
  old_player_code text,
  old_player_name text,
  new_player_code text,
  new_player_name text,
  corrected_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.league_participant_corrections TO authenticated;
GRANT ALL ON public.league_participant_corrections TO service_role;

ALTER TABLE public.league_participant_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club members can view corrections for their fixtures" ON public.league_participant_corrections;
CREATE POLICY "Club members can view corrections for their fixtures"
ON public.league_participant_corrections
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON (NULLIF(upper(l.nsa_team_code), '') IN (upper(plf.home_team_code), upper(plf.away_team_code))
       OR NULLIF(upper(l.code), '') IN (upper(plf.home_team_code), upper(plf.away_team_code)))
    WHERE plf.id = league_participant_corrections.fixture_id
      AND public.is_club_member(auth.uid(), l.club_id)
  )
);

CREATE INDEX IF NOT EXISTS league_participant_corrections_fixture_idx
  ON public.league_participant_corrections (fixture_id);

-- 2. Freeze trigger: allow an explicitly flagged admin correction to change participants
CREATE OR REPLACE FUNCTION public.freeze_league_rubber_participants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.winner IS NOT NULL AND NEW.participants_locked_at IS NULL THEN
      NEW.participants_locked_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.participants_locked_at IS NOT NULL
     AND COALESCE(current_setting('app.participant_correction', true), '') <> 'on' THEN
    NEW.home_player_member_id  := OLD.home_player_member_id;
    NEW.away_player_member_id  := OLD.away_player_member_id;
    NEW.home_player2_member_id := OLD.home_player2_member_id;
    NEW.away_player2_member_id := OLD.away_player2_member_id;
    NEW.home_player_code  := OLD.home_player_code;
    NEW.away_player_code  := OLD.away_player_code;
    NEW.home_player_name  := OLD.home_player_name;
    NEW.away_player_name  := OLD.away_player_name;
    NEW.home_player2_code := OLD.home_player2_code;
    NEW.away_player2_code := OLD.away_player2_code;
    NEW.home_player2_name := OLD.home_player2_name;
    NEW.away_player2_name := OLD.away_player2_name;
    NEW.rubber_type := OLD.rubber_type;
    NEW.participants_locked_at := OLD.participants_locked_at;
  ELSIF NEW.winner IS NOT NULL AND NEW.participants_locked_at IS NULL THEN
    NEW.participants_locked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Admin-only, audited participant correction (scores untouched)
CREATE OR REPLACE FUNCTION public.admin_correct_rubber_participant(
  p_fixture_id uuid,
  p_position integer,
  p_side text,
  p_player_code text,
  p_player_name text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_row public.league_match_results%ROWTYPE;
  v_old_code text;
  v_old_name text;
BEGIN
  IF p_side NOT IN ('home','away') THEN
    RAISE EXCEPTION 'Invalid side';
  END IF;

  SELECT public.is_platform_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.platform_league_fixtures plf
        JOIN public.leagues l
          ON (NULLIF(upper(l.nsa_team_code), '') IN (upper(plf.home_team_code), upper(plf.away_team_code))
           OR NULLIF(upper(l.code), '') IN (upper(plf.home_team_code), upper(plf.away_team_code)))
        WHERE plf.id = p_fixture_id
          AND public.is_club_admin(auth.uid(), l.club_id)
      )
  INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Only a club admin may correct a played game participant';
  END IF;

  SELECT * INTO v_row
  FROM public.league_match_results
  WHERE fixture_id = p_fixture_id AND position = p_position;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No recorded game at this position';
  END IF;

  IF p_side = 'home' THEN
    v_old_code := v_row.home_player_code;
    v_old_name := v_row.home_player_name;
  ELSE
    v_old_code := v_row.away_player_code;
    v_old_name := v_row.away_player_name;
  END IF;

  PERFORM set_config('app.participant_correction', 'on', true);

  IF p_side = 'home' THEN
    UPDATE public.league_match_results
       SET home_player_code = upper(COALESCE(p_player_code, '')),
           home_player_name = p_player_name,
           home_player_member_id = NULL,
           updated_at = now()
     WHERE fixture_id = p_fixture_id AND position = p_position;
  ELSE
    UPDATE public.league_match_results
       SET away_player_code = upper(COALESCE(p_player_code, '')),
           away_player_name = p_player_name,
           away_player_member_id = NULL,
           updated_at = now()
     WHERE fixture_id = p_fixture_id AND position = p_position;
  END IF;

  PERFORM set_config('app.participant_correction', 'off', true);

  INSERT INTO public.league_participant_corrections (
    fixture_id, position, side,
    old_player_code, old_player_name,
    new_player_code, new_player_name,
    corrected_by, reason
  ) VALUES (
    p_fixture_id, p_position, p_side,
    v_old_code, v_old_name,
    upper(COALESCE(p_player_code, '')), p_player_name,
    auth.uid(), p_reason
  );

  RETURN jsonb_build_object(
    'ok', true,
    'position', p_position,
    'side', p_side,
    'old_player_code', v_old_code,
    'old_player_name', v_old_name,
    'new_player_code', upper(COALESCE(p_player_code, '')),
    'new_player_name', p_player_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_correct_rubber_participant(uuid, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_correct_rubber_participant(uuid, integer, text, text, text, text) TO authenticated;

-- 4. Weekly lineup sync must never overwrite a confirmed / locked fixture lineup
CREATE OR REPLACE FUNCTION public.sync_match_results_from_lineup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_league_id uuid;
  v_position int;
  v_member_id uuid;
  v_week_start date;
  v_op text := TG_OP;
  v_league_code text;
  v_assoc_id uuid;
  v_club_id uuid;
  v_member_name text;
  v_player_code text;
  v_fix record;
  v_has_scores boolean;
  v_protected boolean;
BEGIN
  IF v_op = 'DELETE' THEN
    v_league_id := OLD.league_id;
    v_position  := OLD.position;
    v_week_start := OLD.week_start_date;
    v_member_id := NULL;
  ELSE
    v_league_id := NEW.league_id;
    v_position  := NEW.position;
    v_week_start := NEW.week_start_date;
    v_member_id := NEW.club_member_id;
  END IF;

  SELECT l.code, l.association_id, l.club_id
    INTO v_league_code, v_assoc_id, v_club_id
  FROM leagues l WHERE l.id = v_league_id;

  IF v_league_code IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_member_id IS NOT NULL THEN
    SELECT cm.name, cm.club_member_number INTO v_member_name, v_player_code
    FROM club_members cm WHERE cm.id = v_member_id;

    SELECT COALESCE(NULLIF(mlr.league_association_number, ''), v_player_code)
      INTO v_player_code
    FROM member_league_registrations mlr
    WHERE mlr.club_member_id = v_member_id
      AND mlr.league_id = v_league_id
    LIMIT 1;
  END IF;

  FOR v_fix IN
    SELECT plf.id,
           (plf.home_team_code = v_league_code) AS is_home
    FROM platform_league_fixtures plf
    WHERE (plf.home_team_code = v_league_code OR plf.away_team_code = v_league_code)
      AND plf.fixture_date >= v_week_start
      AND plf.fixture_date <  v_week_start + INTERVAL '7 days'
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM league_match_results lmr
      WHERE lmr.fixture_id = v_fix.id
        AND (COALESCE(lmr.home_games_won,0) > 0
          OR COALESCE(lmr.away_games_won,0) > 0
          OR COALESCE(lmr.is_forfeit,false) = true)
    ) INTO v_has_scores;
    IF v_has_scores THEN CONTINUE; END IF;

    -- Never overwrite a captain-confirmed or locked fixture lineup slot.
    SELECT EXISTS (
      SELECT 1 FROM league_match_results lmr
      WHERE lmr.fixture_id = v_fix.id
        AND lmr.position = v_position
        AND (lmr.lineup_set_at IS NOT NULL OR lmr.participants_locked_at IS NOT NULL)
    ) INTO v_protected;
    IF v_protected THEN CONTINUE; END IF;

    IF v_fix.is_home THEN
      UPDATE league_match_results
         SET home_player_code = v_player_code,
             home_player_name = v_member_name,
             updated_at = now()
       WHERE fixture_id = v_fix.id AND position = v_position;
    ELSE
      UPDATE league_match_results
         SET away_player_code = v_player_code,
             away_player_name = v_member_name,
             updated_at = now()
       WHERE fixture_id = v_fix.id AND position = v_position;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;