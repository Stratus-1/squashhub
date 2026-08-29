-- 1. Per-source ladder switches on the club's ladder config
ALTER TABLE public.ladder_configs
  ADD COLUMN IF NOT EXISTS ladder_from_leagues boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ladder_from_tournaments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS league_movement_policy text,
  ADD COLUMN IF NOT EXISTS tournament_movement_policy text;

ALTER TABLE public.ladder_configs
  DROP CONSTRAINT IF EXISTS ladder_configs_league_movement_policy_check;
ALTER TABLE public.ladder_configs
  ADD CONSTRAINT ladder_configs_league_movement_policy_check
  CHECK (league_movement_policy IS NULL OR league_movement_policy IN ('swap','insert'));

ALTER TABLE public.ladder_configs
  DROP CONSTRAINT IF EXISTS ladder_configs_tournament_movement_policy_check;
ALTER TABLE public.ladder_configs
  ADD CONSTRAINT ladder_configs_tournament_movement_policy_check
  CHECK (tournament_movement_policy IS NULL OR tournament_movement_policy IN ('swap','insert'));

COMMENT ON COLUMN public.ladder_configs.league_movement_policy IS
  'NULL = inherit movement_policy. swap = exchange positions; insert = winner takes the spot, others shift down.';

-- 2. Per-tournament override (NULL = inherit the club default)
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS ladder_affects boolean;

COMMENT ON COLUMN public.tournaments.ladder_affects IS
  'NULL = follow ladder_configs.ladder_from_tournaments. false = this event never moves the club ladder.';

-- 3. Shared ladder movement engine
CREATE OR REPLACE FUNCTION public.apply_ladder_result(
  _club_id uuid,
  _winner_member_id uuid,
  _loser_member_id uuid,
  _movement text DEFAULT 'insert'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  w_rank integer; l_rank integer;
  w_group text; l_group text;
  v_move text := CASE WHEN lower(COALESCE(_movement,'')) = 'swap' THEN 'swap' ELSE 'insert' END;
BEGIN
  IF _club_id IS NULL OR _winner_member_id IS NULL OR _loser_member_id IS NULL
     OR _winner_member_id = _loser_member_id THEN
    RETURN false;
  END IF;

  -- Visitors and members who are not on the ladder never move it.
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

  IF w_rank IS NULL OR l_rank IS NULL OR w_group IS DISTINCT FROM l_group THEN
    RETURN false;
  END IF;

  -- Only an upset moves the ladder: the winner must currently sit BELOW the loser.
  IF w_rank <= l_rank THEN
    RETURN false;
  END IF;

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
       AND (CASE WHEN lower(COALESCE(cm.gender,'')) IN ('female','ladies','f') THEN 'ladies' ELSE 'men' END) = w_group;

    UPDATE public.club_members
       SET ladder_position = l_rank, updated_at = now()
     WHERE id = _winner_member_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ladder_result(uuid,uuid,uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ladder_result(uuid,uuid,uuid,text) TO service_role;

-- 4. Championship / tournament results
CREATE OR REPLACE FUNCTION public.award_points_for_champ_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_loser uuid;
  v_override boolean;
  v_enabled boolean;
  v_move text;
BEGIN
  IF NEW.winner_member_id IS NULL OR COALESCE(NEW.is_bye,false) IS TRUE THEN RETURN NEW; END IF;
  IF NEW.partner_a_member_id IS NOT NULL OR NEW.partner_b_member_id IS NOT NULL THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.status,'')) NOT IN ('completed','confirmed','finished') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.winner_member_id IS NOT DISTINCT FROM NEW.winner_member_id
     AND lower(COALESCE(OLD.status,'')) IN ('completed','confirmed','finished') THEN
    RETURN NEW;
  END IF;

  IF NEW.player_a_member_id IS NULL OR NEW.player_b_member_id IS NULL THEN RETURN NEW; END IF;

  v_loser := CASE WHEN NEW.winner_member_id = NEW.player_a_member_id
                  THEN NEW.player_b_member_id ELSE NEW.player_a_member_id END;

  SELECT t.club_id, t.ladder_affects INTO v_club_id, v_override
  FROM public.tournaments t WHERE t.id = NEW.champ_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.award_ranking_points_for_result(
    v_club_id, NEW.winner_member_id, v_loser, 'tournament', NEW.id
  );

  SELECT COALESCE(lc.ladder_from_tournaments,true),
         COALESCE(lc.tournament_movement_policy, lc.movement_policy, 'insert')
    INTO v_enabled, v_move
  FROM public.ladder_configs lc WHERE lc.club_id = v_club_id;

  IF COALESCE(v_override, v_enabled, false) IS TRUE THEN
    PERFORM public.apply_ladder_result(v_club_id, NEW.winner_member_id, v_loser, COALESCE(v_move,'insert'));
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. League rubbers
CREATE OR REPLACE FUNCTION public.award_points_for_league_rubber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_winner uuid; v_loser uuid;
  v_wc uuid; v_lc uuid;
  v_enabled boolean; v_move text;
BEGIN
  IF NEW.winner IS NULL OR NEW.winner NOT IN ('home','away') THEN RETURN NEW; END IF;
  IF NEW.home_player_member_id IS NULL OR NEW.away_player_member_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.winner IS NOT DISTINCT FROM NEW.winner
     AND OLD.home_player_member_id IS NOT DISTINCT FROM NEW.home_player_member_id
     AND OLD.away_player_member_id IS NOT DISTINCT FROM NEW.away_player_member_id THEN
    RETURN NEW;
  END IF;

  IF NEW.winner = 'home' THEN
    v_winner := NEW.home_player_member_id; v_loser := NEW.away_player_member_id;
  ELSE
    v_winner := NEW.away_player_member_id; v_loser := NEW.home_player_member_id;
  END IF;

  SELECT club_id INTO v_wc FROM public.club_members WHERE id = v_winner;
  SELECT club_id INTO v_lc FROM public.club_members WHERE id = v_loser;
  IF v_wc IS NULL OR v_wc IS DISTINCT FROM v_lc THEN RETURN NEW; END IF;

  PERFORM public.award_ranking_points_for_result(v_wc, v_winner, v_loser, 'league', NEW.id);

  SELECT COALESCE(lc.ladder_from_leagues,true),
         COALESCE(lc.league_movement_policy, lc.movement_policy, 'insert')
    INTO v_enabled, v_move
  FROM public.ladder_configs lc WHERE lc.club_id = v_wc;

  IF COALESCE(v_enabled,false) IS TRUE THEN
    PERFORM public.apply_ladder_result(v_wc, v_winner, v_loser, COALESCE(v_move,'insert'));
  END IF;

  RETURN NEW;
END;
$function$;