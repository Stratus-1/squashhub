-- Auto ladder ranks (positions 1–20) based on profile stats.
-- - Rank is derived from wins/losses/matches_played, unless manually overridden.
-- - Manual override: set `rank_locked = true` (via admin_set_rank / admin_bulk_set_ranks).
-- - When unlocked, ranks are recomputed automatically whenever stats change.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rank_locked boolean NOT NULL DEFAULT false;

-- Recompute ranks for unlocked profiles, preserving locked ranks.
CREATE OR REPLACE FUNCTION public.recompute_ladder_ranks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Serialize all ladder edits (same lock as admin_set_rank / bulk).
  PERFORM pg_advisory_xact_lock(923402);

  WITH locked AS (
    SELECT p.rank
    FROM public.profiles p
    WHERE p.rank_locked IS TRUE
      AND p.rank IS NOT NULL
      AND p.rank BETWEEN 1 AND 20
      AND p.merged_into IS NULL
  ),
  available AS (
    SELECT
      gs AS rank,
      row_number() OVER (ORDER BY gs) AS rn
    FROM generate_series(1, 20) gs
    WHERE gs NOT IN (SELECT rank FROM locked)
  ),
  candidates AS (
    SELECT
      p.id,
      row_number() OVER (
        ORDER BY
          p.wins DESC,
          p.losses ASC,
          p.matches_played DESC,
          p.name ASC,
          p.id ASC
      ) AS rn
    FROM public.profiles p
    WHERE p.rank_locked IS FALSE
      AND p.merged_into IS NULL
  ),
  selected AS (
    SELECT c.id, a.rank
    FROM candidates c
    JOIN available a ON a.rn = c.rn
  ),
  to_clear AS (
    -- Only clear unlocked ranks that will change or drop out.
    SELECT p.id
    FROM public.profiles p
    LEFT JOIN selected s ON s.id = p.id
    WHERE p.rank_locked IS FALSE
      AND p.rank IS NOT NULL
      AND (s.rank IS NULL OR p.rank IS DISTINCT FROM s.rank)
  )
  UPDATE public.profiles p
  SET rank = NULL
  WHERE p.id IN (SELECT id FROM to_clear);

  WITH locked AS (
    SELECT p.rank
    FROM public.profiles p
    WHERE p.rank_locked IS TRUE
      AND p.rank IS NOT NULL
      AND p.rank BETWEEN 1 AND 20
      AND p.merged_into IS NULL
  ),
  available AS (
    SELECT
      gs AS rank,
      row_number() OVER (ORDER BY gs) AS rn
    FROM generate_series(1, 20) gs
    WHERE gs NOT IN (SELECT rank FROM locked)
  ),
  candidates AS (
    SELECT
      p.id,
      row_number() OVER (
        ORDER BY
          p.wins DESC,
          p.losses ASC,
          p.matches_played DESC,
          p.name ASC,
          p.id ASC
      ) AS rn
    FROM public.profiles p
    WHERE p.rank_locked IS FALSE
      AND p.merged_into IS NULL
  ),
  selected AS (
    SELECT c.id, a.rank
    FROM candidates c
    JOIN available a ON a.rn = c.rn
  )
  UPDATE public.profiles p
  SET rank = s.rank
  FROM selected s
  WHERE p.id = s.id
    AND p.rank IS DISTINCT FROM s.rank;
END;
$$;

-- Trigger wrapper
CREATE OR REPLACE FUNCTION public._trigger_recompute_ladder_ranks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_ladder_ranks();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS recompute_ladder_ranks_on_profile_stats ON public.profiles;
CREATE TRIGGER recompute_ladder_ranks_on_profile_stats
  AFTER UPDATE OF matches_played, wins, losses ON public.profiles
  FOR EACH STATEMENT
  EXECUTE FUNCTION public._trigger_recompute_ladder_ranks();

-- Manual rank updates should lock that user and then re-run the ladder calculation.
CREATE OR REPLACE FUNCTION public.admin_set_rank(target_user_id uuid, new_rank integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL OR NOT public.is_admin_or_moderator(uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF new_rank IS NOT NULL AND (new_rank < 1 OR new_rank > 20) THEN
    RAISE EXCEPTION 'new_rank must be between 1 and 20 (or null)';
  END IF;

  PERFORM pg_advisory_xact_lock(923402);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF new_rank IS NULL THEN
    -- Clear manual override; return to auto-ranking.
    UPDATE public.profiles
    SET rank = NULL, rank_locked = false, updated_at = now()
    WHERE id = target_user_id;

    PERFORM public.recompute_ladder_ranks();
    RETURN;
  END IF;

  -- Prevent assigning to an already-locked rank.
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id <> target_user_id
      AND rank_locked IS TRUE
      AND rank = new_rank
  ) THEN
    RAISE EXCEPTION 'Rank % is locked by another player', new_rank;
  END IF;

  -- Clear any existing (unlocked) occupant of this rank.
  UPDATE public.profiles
  SET rank = NULL, updated_at = now()
  WHERE id <> target_user_id
    AND rank_locked IS FALSE
    AND rank = new_rank;

  UPDATE public.profiles
  SET rank = new_rank, rank_locked = true, updated_at = now()
  WHERE id = target_user_id;

  PERFORM public.recompute_ladder_ranks();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_rank(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_rank(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_bulk_set_ranks(assignments jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  item jsonb;
  pid uuid;
  prank integer;
  seen_ranks int[] := ARRAY[]::int[];
BEGIN
  uid := auth.uid();
  IF uid IS NULL OR NOT public.is_admin_or_moderator(uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF assignments IS NULL OR jsonb_typeof(assignments) <> 'array' THEN
    RAISE EXCEPTION 'assignments must be a JSON array';
  END IF;

  PERFORM pg_advisory_xact_lock(923402);

  -- Validate items (unique ranks, 1..20)
  FOR item IN SELECT * FROM jsonb_array_elements(assignments) LOOP
    pid := (item->>'user_id')::uuid;
    prank := (item->>'rank')::int;

    IF pid IS NULL OR prank IS NULL THEN
      RAISE EXCEPTION 'Each assignment must include user_id and rank';
    END IF;
    IF prank < 1 OR prank > 20 THEN
      RAISE EXCEPTION 'Rank % must be between 1 and 20', prank;
    END IF;
    IF prank = ANY(seen_ranks) THEN
      RAISE EXCEPTION 'Duplicate rank in import: %', prank;
    END IF;
    seen_ranks := array_append(seen_ranks, prank);

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = pid) THEN
      RAISE EXCEPTION 'Profile not found for user_id %', pid;
    END IF;
  END LOOP;

  -- Reset ladder: clear ranks + unlock everyone first.
  UPDATE public.profiles
  SET rank = NULL, rank_locked = false, updated_at = now()
  WHERE rank IS NOT NULL OR rank_locked IS TRUE;

  -- Assign locked ranks.
  FOR item IN SELECT * FROM jsonb_array_elements(assignments) LOOP
    pid := (item->>'user_id')::uuid;
    prank := (item->>'rank')::int;
    UPDATE public.profiles
    SET rank = prank, rank_locked = true, updated_at = now()
    WHERE id = pid;
  END LOOP;

  -- Fill remaining slots by stats.
  PERFORM public.recompute_ladder_ranks();

  PERFORM public._audit_log_insert(
    'ladder_import',
    'profiles',
    NULL,
    'Bulk ladder import',
    jsonb_build_object('count', jsonb_array_length(assignments))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_set_ranks(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_set_ranks(jsonb) TO authenticated;

-- Stats-based ladder: remove "challenge winner takes rank" movement.
-- Rank now updates via recompute_ladder_ranks() on stats changes.
CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects()
RETURNS TRIGGER AS $$
DECLARE
  winner uuid;
  loser uuid;
BEGIN
  IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_friendly, false) IS TRUE THEN
    -- Friendly matches never affect ladder or profile stats.
    RETURN NEW;
  END IF;

  IF NEW.winner_id IS NULL THEN
    RAISE EXCEPTION 'Cannot confirm a match without a winner';
  END IF;

  winner := NEW.winner_id;
  loser := CASE WHEN winner = NEW.player_a THEN NEW.player_b ELSE NEW.player_a END;

  -- Update player stats (once, on confirmation).
  UPDATE public.profiles
  SET
    matches_played = matches_played + 1,
    wins = wins + CASE WHEN id = winner THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN id = loser THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id IN (winner, loser);

  -- Update form + last match time.
  PERFORM public.recompute_profile_form_last5(winner);
  PERFORM public.recompute_profile_form_last5(loser);

  -- Mark linked challenge complete (if any).
  IF NEW.challenge_id IS NOT NULL THEN
    UPDATE public.challenges
    SET status = 'completed', updated_at = now()
    WHERE id = NEW.challenge_id
      AND status <> 'completed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- One-time: bring existing data into a consistent, stats-based ladder.
DO $$
BEGIN
  PERFORM public.recompute_ladder_ranks();
END $$;
