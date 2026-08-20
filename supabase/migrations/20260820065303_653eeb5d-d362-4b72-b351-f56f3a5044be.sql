-- 1. Court Bookings must never be auto-disabled for clubs that simply had no
--    courts yet. Only an explicit admin action (enabled_by set) may keep it off.
UPDATE public.club_capabilities
SET enabled = true, enabled_at = now(), disabled_at = NULL
WHERE capability = 'bookings'
  AND enabled = false
  AND enabled_by IS NULL;

-- 2. Reliable, idempotent save path for the Live Match Marker.
CREATE OR REPLACE FUNCTION public.save_marker_match_result(
  _match_id uuid,
  _club_id uuid,
  _player_a_member_id uuid,
  _player_b_member_id uuid,
  _winner_member_id uuid,
  _score text,
  _game_scores text,
  _duration_s integer,
  _confirmed boolean,
  _notes text,
  _tournament_match_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _champ uuid;
  _allowed boolean := false;
  _existing uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: a retry with the same client-generated id must not duplicate.
  SELECT id INTO _existing FROM public.matches WHERE id = _match_id;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  IF _club_id IS NOT NULL AND public.is_club_member(_uid, _club_id) THEN
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

  INSERT INTO public.matches (
    id, player_a_member_id, player_b_member_id, winner_member_id,
    score, game_scores, duration_s, submitted_by, confirmed, notes, club_id
  ) VALUES (
    _match_id, _player_a_member_id, _player_b_member_id, _winner_member_id,
    _score, _game_scores, _duration_s, _uid, COALESCE(_confirmed, false), _notes, _club_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN _match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_marker_match_result(
  uuid, uuid, uuid, uuid, uuid, text, text, integer, boolean, text, uuid
) TO authenticated;