CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE clubs(id uuid primary key, mixed_ladder_enabled boolean, challenge_levels_up int);
CREATE TABLE club_members(id uuid primary key,club_id uuid,user_id uuid,gender text,ladder_position int,joined_at timestamptz,updated_at timestamptz);
CREATE TABLE ladder_configs(id uuid,club_id uuid,format text,challenge_levels_up int,pyramid_row_sizes int[],max_active_outgoing int,max_active_incoming int,rematch_cooldown_days int,movement_policy text,affects_club_ranking boolean,ladder_auto_apply boolean);
CREATE TABLE matches(id uuid primary key,club_id uuid,confirmed boolean,disputed boolean,challenge_id uuid,source_type text,winner_member_id uuid,player_a_member_id uuid,player_b_member_id uuid,winner_id uuid,player_a uuid,player_b uuid);
CREATE TABLE challenges(id uuid,club_id uuid,challenger_member_id uuid,opponent_member_id uuid,challenger_id uuid,opponent_id uuid,status text,updated_at timestamptz);
CREATE TABLE ladder_moves_pending(club_id uuid,status text,winner_member_id uuid,loser_member_id uuid,source text,source_id uuid,movement text,winner_position int,loser_position int);
CREATE TABLE award_calls(source_id uuid, winner uuid,loser uuid);
CREATE FUNCTION award_ranking_points_for_result(uuid,uuid,uuid,text,uuid) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN INSERT INTO award_calls VALUES($5,$2,$3); RETURN $5; END $$;
CREATE FUNCTION is_rankable_member(uuid) RETURNS boolean LANGUAGE sql AS $$ select exists(select 1 from club_members where id=$1) $$;
CREATE FUNCTION ladder_pyramid_row(int,int[]) RETURNS int LANGUAGE sql AS $$ select ceil((sqrt(8*$1+1)-1)/2)::int $$;
CREATE FUNCTION validate_challenge_gender_group(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ select coalesce((select mixed_ladder_enabled from clubs where id=$1),false) or $2 is not distinct from $3 $$;
CREATE OR REPLACE FUNCTION public.validate_challenge_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  challenger_rank integer;
  opponent_rank integer;
  challenger_group text;
  opponent_group text;
  existing_id uuid;
  max_levels integer;
  v_club_id uuid;
  cfg public.ladder_configs%ROWTYPE;
  ch_row integer;
  op_row integer;
  open_out integer;
  open_in integer;
  last_meet timestamptz;
BEGIN
  IF NEW.challenger_id = NEW.opponent_id AND NEW.opponent_id IS NOT NULL THEN
    RAISE EXCEPTION 'You cannot challenge yourself';
  END IF;

  v_club_id := NEW.club_id;
  IF v_club_id IS NULL THEN
    IF NEW.challenger_member_id IS NOT NULL THEN
      SELECT cm.club_id INTO v_club_id FROM public.club_members cm WHERE cm.id = NEW.challenger_member_id LIMIT 1;
    ELSIF NEW.challenger_id IS NOT NULL THEN
      SELECT cm.club_id INTO v_club_id FROM public.club_members cm
      WHERE cm.user_id = NEW.challenger_id ORDER BY cm.joined_at DESC LIMIT 1;
    END IF;
  END IF;

  IF NEW.challenger_member_id IS NOT NULL THEN
    SELECT cm.ladder_position,
           CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END
      INTO challenger_rank, challenger_group
    FROM public.club_members cm
    WHERE cm.id = NEW.challenger_member_id AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    LIMIT 1;
  ELSE
    SELECT cm.ladder_position,
           CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END
      INTO challenger_rank, challenger_group
    FROM public.club_members cm
    WHERE NEW.challenger_id IS NOT NULL AND cm.user_id = NEW.challenger_id
      AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    ORDER BY cm.joined_at DESC LIMIT 1;
  END IF;

  IF NEW.opponent_member_id IS NOT NULL THEN
    SELECT cm.ladder_position,
           CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END
      INTO opponent_rank, opponent_group
    FROM public.club_members cm
    WHERE cm.id = NEW.opponent_member_id AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    LIMIT 1;
  ELSE
    SELECT cm.ladder_position,
           CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END
      INTO opponent_rank, opponent_group
    FROM public.club_members cm
    WHERE NEW.opponent_id IS NOT NULL AND cm.user_id = NEW.opponent_id
      AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    ORDER BY cm.joined_at DESC LIMIT 1;
  END IF;

  IF challenger_rank IS NULL OR opponent_rank IS NULL THEN
    RAISE EXCEPTION 'Both players must have a ladder rank';
  END IF;

  IF NOT public.validate_challenge_gender_group(v_club_id, challenger_group, opponent_group) THEN
    RAISE EXCEPTION 'Challenges are only allowed within the same ladder group';
  END IF;

  IF challenger_rank <= opponent_rank THEN
    RAISE EXCEPTION 'You may only challenge players above you';
  END IF;

  SELECT * INTO cfg FROM public.ladder_configs WHERE club_id = v_club_id;

  IF cfg.id IS NOT NULL AND cfg.format = 'pyramid' THEN
    ch_row := public.ladder_pyramid_row(challenger_rank, cfg.pyramid_row_sizes);
    op_row := public.ladder_pyramid_row(opponent_rank, cfg.pyramid_row_sizes);
    IF ch_row IS NULL OR op_row IS NULL OR op_row <> ch_row - 1 THEN
      RAISE EXCEPTION 'You may only challenge players in the row directly above you';
    END IF;
  ELSE
    max_levels := COALESCE(cfg.challenge_levels_up, (SELECT COALESCE(c.challenge_levels_up, 2) FROM public.clubs c WHERE c.id = v_club_id), 2);
    IF (challenger_rank - opponent_rank) > max_levels THEN
      RAISE EXCEPTION 'You may challenge up to % positions above you', max_levels;
    END IF;
  END IF;

  SELECT id INTO existing_id
  FROM public.challenges
  WHERE status IN ('pending','accepted')
    AND (
      (NEW.challenger_member_id IS NOT NULL AND NEW.opponent_member_id IS NOT NULL AND (
        (challenger_member_id = NEW.challenger_member_id AND opponent_member_id = NEW.opponent_member_id)
        OR (challenger_member_id = NEW.opponent_member_id AND opponent_member_id = NEW.challenger_member_id)
      ))
      OR (NEW.opponent_id IS NOT NULL AND (
        (challenger_id = NEW.challenger_id AND opponent_id = NEW.opponent_id)
        OR (challenger_id = NEW.opponent_id AND opponent_id = NEW.challenger_id)
      ))
    )
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'An active challenge already exists between these players';
  END IF;

  IF cfg.id IS NOT NULL THEN
    IF cfg.max_active_outgoing > 0 AND NEW.challenger_member_id IS NOT NULL THEN
      SELECT count(*) INTO open_out FROM public.challenges
      WHERE challenger_member_id = NEW.challenger_member_id AND status IN ('pending','accepted');
      IF open_out >= cfg.max_active_outgoing THEN
        RAISE EXCEPTION 'You already have % open challenge(s); finish that first', open_out;
      END IF;
    END IF;

    IF cfg.max_active_incoming > 0 AND NEW.opponent_member_id IS NOT NULL THEN
      SELECT count(*) INTO open_in FROM public.challenges
      WHERE opponent_member_id = NEW.opponent_member_id AND status IN ('pending','accepted');
      IF open_in >= cfg.max_active_incoming THEN
        RAISE EXCEPTION 'That player already has the maximum number of open challenges';
      END IF;
    END IF;

    IF cfg.rematch_cooldown_days > 0 AND NEW.challenger_member_id IS NOT NULL AND NEW.opponent_member_id IS NOT NULL THEN
      SELECT max(updated_at) INTO last_meet FROM public.challenges
      WHERE status = 'completed'
        AND ((challenger_member_id = NEW.challenger_member_id AND opponent_member_id = NEW.opponent_member_id)
          OR (challenger_member_id = NEW.opponent_member_id AND opponent_member_id = NEW.challenger_member_id));
      IF last_meet IS NOT NULL AND last_meet > now() - make_interval(days => cfg.rematch_cooldown_days) THEN
        RAISE EXCEPTION 'You must wait % days before challenging this player again', cfg.rematch_cooldown_days;
      END IF;
    END IF;
  END IF;

  NEW.status := COALESCE(NEW.status, 'pending');
  RETURN NEW;
END;
$function$;CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  winner uuid;
  loser uuid;
  c_challenger uuid;
  c_opponent uuid;
  c_challenger_member_id uuid;
  c_opponent_member_id uuid;
  challenger_rank integer;
  opponent_rank integer;
  resolved_challenger_member_id uuid;
  resolved_opponent_member_id uuid;
  challenger_group text;
  opponent_group text;
  v_club_id uuid;
  v_movement text := 'insert';
  v_affects boolean := false;
  v_challenger_won boolean := false;
BEGIN
  IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.winner_id IS NULL AND NEW.winner_member_id IS NULL THEN
    RAISE EXCEPTION 'Cannot confirm a match without a winner';
  END IF;

  winner := NEW.winner_id;
  loser := CASE WHEN winner = NEW.player_a THEN NEW.player_b ELSE NEW.player_a END;

  IF winner IS NOT NULL AND loser IS NOT NULL AND winner <> loser THEN
    UPDATE public.profiles
    SET
      matches_played = matches_played + 1,
      wins = wins + CASE WHEN id = winner THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN id = loser THEN 1 ELSE 0 END,
      updated_at = now()
    WHERE id IN (winner, loser);
  ELSIF winner IS NOT NULL THEN
    UPDATE public.profiles
    SET matches_played = matches_played + 1, wins = wins + 1, updated_at = now()
    WHERE id = winner;
  END IF;

  IF NEW.challenge_id IS NOT NULL THEN
    SELECT challenger_id, opponent_id, club_id, challenger_member_id, opponent_member_id
    INTO c_challenger, c_opponent, v_club_id, c_challenger_member_id, c_opponent_member_id
    FROM public.challenges
    WHERE id = NEW.challenge_id;

    IF v_club_id IS NULL THEN
      v_club_id := NEW.club_id;
    END IF;

    SELECT COALESCE(lc.movement_policy,'insert'), COALESCE(lc.affects_club_ranking,false)
      INTO v_movement, v_affects
    FROM public.ladder_configs lc
    WHERE lc.club_id = v_club_id;
    v_movement := COALESCE(v_movement, 'insert');

    -- Resolve both club members regardless of who won
    SELECT cm.id, cm.ladder_position,
      CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies' ELSE 'men' END
    INTO resolved_challenger_member_id, challenger_rank, challenger_group
    FROM public.club_members cm
    WHERE (
      (c_challenger IS NOT NULL AND cm.user_id = c_challenger)
      OR (c_challenger_member_id IS NOT NULL AND cm.id = c_challenger_member_id)
    )
      AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    ORDER BY cm.joined_at DESC
    LIMIT 1;

    SELECT cm.id, cm.ladder_position,
      CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies' ELSE 'men' END
    INTO resolved_opponent_member_id, opponent_rank, opponent_group
    FROM public.club_members cm
    WHERE (
      (c_opponent IS NOT NULL AND cm.user_id = c_opponent)
      OR (c_opponent_member_id IS NOT NULL AND cm.id = c_opponent_member_id)
    )
      AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    ORDER BY cm.joined_at DESC
    LIMIT 1;

    v_challenger_won := (winner IS NOT NULL AND winner = c_challenger)
      OR (NEW.winner_member_id IS NOT NULL AND NEW.winner_member_id = c_challenger_member_id);

    -- Ladder movement only when the challenger (lower-ranked player) wins
    IF v_challenger_won THEN
      IF challenger_rank IS NOT NULL
         AND opponent_rank IS NOT NULL
         AND challenger_group = opponent_group
         AND challenger_rank > opponent_rank THEN

        IF v_movement = 'swap' THEN
          UPDATE public.club_members
          SET ladder_position = opponent_rank, updated_at = now()
          WHERE id = resolved_challenger_member_id;
          UPDATE public.club_members
          SET ladder_position = challenger_rank, updated_at = now()
          WHERE id = resolved_opponent_member_id;
        ELSE
          UPDATE public.club_members cm
          SET ladder_position = cm.ladder_position + 1,
              updated_at = now()
          WHERE (v_club_id IS NULL OR cm.club_id = v_club_id)
            AND (
              (challenger_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
              OR
              (challenger_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
            )
            AND cm.ladder_position IS NOT NULL
            AND cm.ladder_position >= opponent_rank
            AND cm.ladder_position < challenger_rank
            AND cm.id <> resolved_challenger_member_id;

          UPDATE public.club_members
          SET ladder_position = opponent_rank,
              updated_at = now()
          WHERE id = resolved_challenger_member_id;
        END IF;
      END IF;
    END IF;

    -- Ranking points (opt-in per club)
    IF v_affects
       AND resolved_challenger_member_id IS NOT NULL
       AND resolved_opponent_member_id IS NOT NULL THEN
      PERFORM public.award_ranking_points_for_result(
        v_club_id,
        CASE WHEN v_challenger_won THEN resolved_challenger_member_id ELSE resolved_opponent_member_id END,
        CASE WHEN v_challenger_won THEN resolved_opponent_member_id ELSE resolved_challenger_member_id END,
        'challenge',
        NEW.challenge_id
      );
    END IF;

    UPDATE public.challenges
    SET status = 'completed', updated_at = now()
    WHERE id = NEW.challenge_id
      AND status <> 'completed';
  END IF;

  RETURN NEW;
END;
$function$;CREATE OR REPLACE FUNCTION public.ladder_move_apply_now(_club_id uuid, _winner_member_id uuid, _loser_member_id uuid, _movement text DEFAULT 'insert'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w_rank integer; l_rank integer;
  w_group text; l_group text;
  v_prev_source text;
  v_move text := CASE WHEN lower(COALESCE(_movement,'')) = 'swap' THEN 'swap' ELSE 'insert' END;
BEGIN
  IF _club_id IS NULL OR _winner_member_id IS NULL OR _loser_member_id IS NULL
     OR _winner_member_id = _loser_member_id THEN
    RETURN false;
  END IF;

  IF NOT public.is_rankable_member(_winner_member_id)
     OR NOT public.is_rankable_member(_loser_member_id) THEN
    RETURN false;
  END IF;

  SELECT cm.ladder_position,
         CASE WHEN lower(COALESCE(cm.gender,'')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END
    INTO w_rank, w_group
  FROM public.club_members cm WHERE cm.id = _winner_member_id AND cm.club_id = _club_id;

  SELECT cm.ladder_position,
         CASE WHEN lower(COALESCE(cm.gender,'')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END
    INTO l_rank, l_group
  FROM public.club_members cm WHERE cm.id = _loser_member_id AND cm.club_id = _club_id;

  IF w_rank IS NULL OR l_rank IS NULL THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clubs c WHERE c.id = _club_id AND COALESCE(c.mixed_ladder_enabled,false) IS TRUE
  ) AND w_group IS DISTINCT FROM l_group THEN
    RETURN false;
  END IF;

  IF w_rank <= l_rank THEN RETURN false; END IF;

  -- A single result can legitimately shift every player between the two ranks
  -- down by one. Flag this cascade so the bulk-ladder guard allows it, then
  -- restore whatever the caller had set.
  v_prev_source := current_setting('app.ladder_change_source', true);
  PERFORM set_config('app.ladder_change_source', 'ladder_move_apply', true);

  IF v_move = 'swap' THEN
    UPDATE public.club_members SET ladder_position = l_rank, updated_at = now() WHERE id = _winner_member_id;
    UPDATE public.club_members SET ladder_position = w_rank, updated_at = now() WHERE id = _loser_member_id;
  ELSE
    UPDATE public.club_members cm
       SET ladder_position = cm.ladder_position + 1, updated_at = now()
     WHERE cm.club_id = _club_id
       AND cm.ladder_position IS NOT NULL
       AND cm.ladder_position >= l_rank
       AND cm.ladder_position < w_rank
       AND cm.id <> _winner_member_id
       AND (
         EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = _club_id AND COALESCE(c.mixed_ladder_enabled,false) IS TRUE)
         OR (CASE WHEN lower(COALESCE(cm.gender,'')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END) = w_group
       );

    UPDATE public.club_members
       SET ladder_position = l_rank, updated_at = now()
     WHERE id = _winner_member_id;
  END IF;

  PERFORM set_config('app.ladder_change_source', COALESCE(v_prev_source, ''), true);

  RETURN true;
END;
$function$;CREATE OR REPLACE FUNCTION public.apply_ladder_result(
  _club_id uuid,
  _winner_member_id uuid,
  _loser_member_id uuid,
  _movement text DEFAULT 'insert',
  _source text DEFAULT NULL,
  _source_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auto boolean;
  w_rank integer; l_rank integer;
BEGIN
  SELECT COALESCE(lc.ladder_auto_apply, true) INTO v_auto
  FROM public.ladder_configs lc WHERE lc.club_id = _club_id;

  IF COALESCE(v_auto, true) IS TRUE THEN
    RETURN public.ladder_move_apply_now(_club_id, _winner_member_id, _loser_member_id, _movement);
  END IF;

  SELECT ladder_position INTO w_rank FROM public.club_members WHERE id = _winner_member_id AND club_id = _club_id;
  SELECT ladder_position INTO l_rank FROM public.club_members WHERE id = _loser_member_id AND club_id = _club_id;

  IF w_rank IS NULL OR l_rank IS NULL OR w_rank <= l_rank THEN RETURN false; END IF;
  IF NOT public.is_rankable_member(_winner_member_id) OR NOT public.is_rankable_member(_loser_member_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ladder_moves_pending p
    WHERE p.club_id = _club_id AND p.status = 'pending'
      AND p.winner_member_id = _winner_member_id
      AND p.loser_member_id = _loser_member_id
      AND p.source IS NOT DISTINCT FROM _source
      AND p.source_id IS NOT DISTINCT FROM _source_id
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.ladder_moves_pending
    (club_id, winner_member_id, loser_member_id, movement, source, source_id, winner_position, loser_position)
  VALUES (_club_id, _winner_member_id, _loser_member_id,
          CASE WHEN lower(COALESCE(_movement,'')) = 'swap' THEN 'swap' ELSE 'insert' END,
          _source, _source_id, w_rank, l_rank);

  RETURN false;
END;
$$;
CREATE TRIGGER validate_challenge_insert BEFORE INSERT ON challenges FOR EACH ROW EXECUTE FUNCTION validate_challenge_insert();
