-- Admin "club operations"
-- - Audit log (rank changes / match edits / booking cancellations)
-- - Admin tools: merge duplicate users, bulk import ladder ranks
--
-- Notes:
-- - Audit log is append-only and only viewable by admins/moderators.
-- - Merge does not delete auth users; it re-points public data to the target user and marks the source profile as merged.

-- 1) Audit log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  summary text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_audit_log' AND policyname = 'Audit log viewable by admins/moderators'
  ) THEN
    CREATE POLICY "Audit log viewable by admins/moderators"
      ON public.admin_audit_log FOR SELECT TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

-- Internal helper to insert audit entries from triggers / RPCs.
CREATE OR REPLACE FUNCTION public._audit_log_insert(
  _action text,
  _entity_table text,
  _entity_id uuid,
  _summary text,
  _details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_audit_log (actor_id, action, entity_table, entity_id, summary, details)
  VALUES (auth.uid(), _action, _entity_table, _entity_id, _summary, COALESCE(_details, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public._audit_log_insert(text, text, uuid, text, jsonb) FROM PUBLIC;

-- 2) Log rank changes
CREATE OR REPLACE FUNCTION public.audit_profiles_rank_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rank IS DISTINCT FROM OLD.rank THEN
    PERFORM public._audit_log_insert(
      'rank_changed',
      'profiles',
      NEW.id,
      'Rank changed',
      jsonb_build_object(
        'user_id', NEW.id,
        'old_rank', OLD.rank,
        'new_rank', NEW.rank
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_profiles_rank_change_trigger ON public.profiles;
CREATE TRIGGER audit_profiles_rank_change_trigger
  AFTER UPDATE OF rank ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_profiles_rank_change();

-- 3) Log booking cancellations
CREATE OR REPLACE FUNCTION public.audit_booking_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
    PERFORM public._audit_log_insert(
      'booking_cancelled',
      'bookings',
      NEW.id,
      'Booking cancelled',
      jsonb_build_object(
        'booking_id', NEW.id,
        'court_id', NEW.court_id,
        'date', NEW.date,
        'start_time', NEW.start_time,
        'end_time', NEW.end_time,
        'user_id', NEW.user_id,
        'opponent_id', NEW.opponent_id,
        'challenge_id', NEW.challenge_id,
        'cancelled_by', COALESCE(NEW.cancelled_by, auth.uid())
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_booking_cancel_trigger ON public.bookings;
CREATE TRIGGER audit_booking_cancel_trigger
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_booking_cancel();

-- 4) Log match edits / confirmations / disputes
CREATE OR REPLACE FUNCTION public.audit_match_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed jsonb := '{}'::jsonb;
BEGIN
  IF NEW.score IS DISTINCT FROM OLD.score THEN
    changed := changed || jsonb_build_object('score', jsonb_build_object('old', OLD.score, 'new', NEW.score));
  END IF;
  IF NEW.game_scores IS DISTINCT FROM OLD.game_scores THEN
    changed := changed || jsonb_build_object('game_scores', jsonb_build_object('old', OLD.game_scores, 'new', NEW.game_scores));
  END IF;
  IF NEW.winner_id IS DISTINCT FROM OLD.winner_id THEN
    changed := changed || jsonb_build_object('winner_id', jsonb_build_object('old', OLD.winner_id, 'new', NEW.winner_id));
  END IF;
  IF NEW.confirmed IS DISTINCT FROM OLD.confirmed THEN
    changed := changed || jsonb_build_object('confirmed', jsonb_build_object('old', OLD.confirmed, 'new', NEW.confirmed));
  END IF;
  IF NEW.disputed IS DISTINCT FROM OLD.disputed THEN
    changed := changed || jsonb_build_object('disputed', jsonb_build_object('old', OLD.disputed, 'new', NEW.disputed));
  END IF;
  IF NEW.dispute_notes IS DISTINCT FROM OLD.dispute_notes THEN
    changed := changed || jsonb_build_object('dispute_notes', jsonb_build_object('old', OLD.dispute_notes, 'new', NEW.dispute_notes));
  END IF;
  IF NEW.challenge_id IS DISTINCT FROM OLD.challenge_id THEN
    changed := changed || jsonb_build_object('challenge_id', jsonb_build_object('old', OLD.challenge_id, 'new', NEW.challenge_id));
  END IF;
  IF NEW.match_date IS DISTINCT FROM OLD.match_date THEN
    changed := changed || jsonb_build_object('match_date', jsonb_build_object('old', OLD.match_date, 'new', NEW.match_date));
  END IF;
  IF NEW.court_id IS DISTINCT FROM OLD.court_id THEN
    changed := changed || jsonb_build_object('court_id', jsonb_build_object('old', OLD.court_id, 'new', NEW.court_id));
  END IF;
  IF NEW.is_friendly IS DISTINCT FROM OLD.is_friendly THEN
    changed := changed || jsonb_build_object('is_friendly', jsonb_build_object('old', OLD.is_friendly, 'new', NEW.is_friendly));
  END IF;

  IF changed <> '{}'::jsonb THEN
    PERFORM public._audit_log_insert(
      'match_updated',
      'matches',
      NEW.id,
      'Match updated',
      jsonb_build_object(
        'match_id', NEW.id,
        'player_a', NEW.player_a,
        'player_b', NEW.player_b,
        'changed', changed
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_match_update_trigger ON public.matches;
CREATE TRIGGER audit_match_update_trigger
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_match_update();

-- 5) Merge tracking on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

-- 6) Admin merge users
CREATE OR REPLACE FUNCTION public.admin_merge_users(source_user_id uuid, target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  p_source record;
  p_target record;
BEGIN
  uid := auth.uid();
  IF uid IS NULL OR NOT public.has_role(uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF source_user_id IS NULL OR target_user_id IS NULL OR source_user_id = target_user_id THEN
    RAISE EXCEPTION 'source_user_id and target_user_id must be different';
  END IF;

  -- serialize merges + rank edits
  PERFORM pg_advisory_xact_lock(923450);

  SELECT * INTO p_source FROM public.profiles WHERE id = source_user_id;
  SELECT * INTO p_target FROM public.profiles WHERE id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile not found';
  END IF;
  IF p_source.id IS NULL THEN
    RAISE EXCEPTION 'Source profile not found';
  END IF;

  -- bookings
  UPDATE public.bookings SET user_id = target_user_id WHERE user_id = source_user_id;
  UPDATE public.bookings SET opponent_id = target_user_id WHERE opponent_id = source_user_id;
  UPDATE public.bookings SET cancelled_by = target_user_id WHERE cancelled_by = source_user_id;

  -- challenges
  UPDATE public.challenges SET challenger_id = target_user_id WHERE challenger_id = source_user_id;
  UPDATE public.challenges SET opponent_id = target_user_id WHERE opponent_id = source_user_id;
  DELETE FROM public.challenges WHERE challenger_id = opponent_id;

  -- matches
  UPDATE public.matches SET player_a = target_user_id WHERE player_a = source_user_id;
  UPDATE public.matches SET player_b = target_user_id WHERE player_b = source_user_id;
  UPDATE public.matches SET winner_id = target_user_id WHERE winner_id = source_user_id;
  UPDATE public.matches SET submitted_by = target_user_id WHERE submitted_by = source_user_id;
  UPDATE public.matches SET disputed_by = target_user_id WHERE disputed_by = source_user_id;
  DELETE FROM public.matches WHERE player_a = player_b;

  -- schedules / sessions
  UPDATE public.scheduled_matches SET player_a = target_user_id WHERE player_a = source_user_id;
  UPDATE public.scheduled_matches SET player_b = target_user_id WHERE player_b = source_user_id;
  UPDATE public.scheduled_matches SET created_by = target_user_id WHERE created_by = source_user_id;
  UPDATE public.game_sessions SET user_id = target_user_id WHERE user_id = source_user_id;
  UPDATE public.game_sessions SET opponent_id = target_user_id WHERE opponent_id = source_user_id;

  -- availability + season snapshots + proposed schedules
  UPDATE public.player_availability SET user_id = target_user_id WHERE user_id = source_user_id;
  INSERT INTO public.season_profiles (
    season_id,
    user_id,
    rank,
    matches_played,
    wins,
    losses,
    form_last5,
    last_competitive_match_at,
    created_at
  )
  SELECT
    season_id,
    target_user_id,
    rank,
    matches_played,
    wins,
    losses,
    form_last5,
    last_competitive_match_at,
    created_at
  FROM public.season_profiles
  WHERE user_id = source_user_id
  ON CONFLICT (season_id, user_id) DO NOTHING;
  DELETE FROM public.season_profiles WHERE user_id = source_user_id;
  UPDATE public.challenge_schedules SET proposed_by = target_user_id WHERE proposed_by = source_user_id;

  -- notifications
  UPDATE public.notifications SET user_id = target_user_id WHERE user_id = source_user_id;

  -- roles (merge without violating unique (user_id, role))
  INSERT INTO public.user_roles (user_id, role)
  SELECT target_user_id, role
  FROM public.user_roles
  WHERE user_id = source_user_id
  ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = source_user_id;

  -- integrations_accounts (unique per provider)
  INSERT INTO public.integrations_accounts (user_id, provider, provider_user_id, display_name, scopes, status, connected_at, updated_at)
  SELECT
    target_user_id, provider, provider_user_id, display_name, scopes, status, connected_at, updated_at
  FROM public.integrations_accounts
  WHERE user_id = source_user_id
  ON CONFLICT (user_id, provider) DO NOTHING;
  DELETE FROM public.integrations_accounts WHERE user_id = source_user_id;

  -- integrations_tokens (unique per provider)
  INSERT INTO public.integrations_tokens (user_id, provider, access_token, refresh_token, expires_at, token_type, raw, created_at, updated_at)
  SELECT
    target_user_id, provider, access_token, refresh_token, expires_at, token_type, raw, created_at, updated_at
  FROM public.integrations_tokens
  WHERE user_id = source_user_id
  ON CONFLICT (user_id, provider) DO NOTHING;
  DELETE FROM public.integrations_tokens WHERE user_id = source_user_id;

  -- device push tokens (unique (user_id, token))
  INSERT INTO public.device_push_tokens (user_id, token, platform, created_at, updated_at, last_seen_at)
  SELECT target_user_id, token, platform, created_at, updated_at, last_seen_at
  FROM public.device_push_tokens
  WHERE user_id = source_user_id
  ON CONFLICT (user_id, token) DO UPDATE
    SET updated_at = EXCLUDED.updated_at,
        last_seen_at = GREATEST(public.device_push_tokens.last_seen_at, EXCLUDED.last_seen_at);
  DELETE FROM public.device_push_tokens WHERE user_id = source_user_id;

  -- mark source profile as merged + remove from ladder
  UPDATE public.profiles
  SET rank = NULL, merged_into = target_user_id, merged_at = now(), updated_at = now()
  WHERE id = source_user_id;

  PERFORM public._audit_log_insert(
    'user_merged',
    'profiles',
    source_user_id,
    'User merged into another account',
    jsonb_build_object('source_user_id', source_user_id, 'target_user_id', target_user_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_merge_users(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_merge_users(uuid, uuid) TO authenticated;

-- 7) Bulk set ranks (import ladder)
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

  -- Clear ladder first to avoid unique collisions.
  UPDATE public.profiles
  SET rank = NULL, updated_at = now()
  WHERE rank IS NOT NULL;

  -- Assign new ranks.
  FOR item IN SELECT * FROM jsonb_array_elements(assignments) LOOP
    pid := (item->>'user_id')::uuid;
    prank := (item->>'rank')::int;
    UPDATE public.profiles
    SET rank = prank, updated_at = now()
    WHERE id = pid;
  END LOOP;

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
