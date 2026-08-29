ALTER TABLE public.ladder_configs
  ADD COLUMN IF NOT EXISTS ladder_auto_apply boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ladder_configs.ladder_auto_apply IS
  'true = competition/challenge results move the ladder immediately. false = moves are queued in ladder_moves_pending for admin approval.';

CREATE TABLE IF NOT EXISTS public.ladder_moves_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  winner_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  loser_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  movement text NOT NULL DEFAULT 'insert',
  source text,
  source_id uuid,
  winner_position integer,
  loser_position integer,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_moves_pending_status_check CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT ladder_moves_pending_movement_check CHECK (movement IN ('swap','insert'))
);

CREATE INDEX IF NOT EXISTS idx_ladder_moves_pending_club_status
  ON public.ladder_moves_pending (club_id, status, created_at DESC);

GRANT SELECT, UPDATE ON public.ladder_moves_pending TO authenticated;
GRANT ALL ON public.ladder_moves_pending TO service_role;

ALTER TABLE public.ladder_moves_pending ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club admins view pending ladder moves" ON public.ladder_moves_pending;
CREATE POLICY "Club admins view pending ladder moves"
  ON public.ladder_moves_pending FOR SELECT TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

DROP POLICY IF EXISTS "Club admins update pending ladder moves" ON public.ladder_moves_pending;
CREATE POLICY "Club admins update pending ladder moves"
  ON public.ladder_moves_pending FOR UPDATE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

DROP TRIGGER IF EXISTS trg_ladder_moves_pending_touch ON public.ladder_moves_pending;
CREATE TRIGGER trg_ladder_moves_pending_touch
  BEFORE UPDATE ON public.ladder_moves_pending
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Internal mover: performs the position change with no approval gate.
CREATE OR REPLACE FUNCTION public.ladder_move_apply_now(
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

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.ladder_move_apply_now(uuid,uuid,uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ladder_move_apply_now(uuid,uuid,uuid,text) TO service_role;

-- Gated entry point used by competition triggers.
CREATE OR REPLACE FUNCTION public.apply_ladder_result(
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

REVOKE ALL ON FUNCTION public.apply_ladder_result(uuid,uuid,uuid,text,text,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ladder_result(uuid,uuid,uuid,text,text,uuid) TO service_role;

-- Admin approval / rejection
CREATE OR REPLACE FUNCTION public.approve_ladder_move_pending(_pending_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p public.ladder_moves_pending%ROWTYPE;
  v_ok boolean;
  v_new_pos integer;
BEGIN
  SELECT * INTO p FROM public.ladder_moves_pending WHERE id = _pending_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Pending ladder move not found'; END IF;
  IF NOT public.is_club_admin(auth.uid(), p.club_id) THEN
    RAISE EXCEPTION 'Not authorised to approve ladder moves for this club';
  END IF;
  IF p.status <> 'pending' THEN RETURN false; END IF;

  SELECT ladder_position INTO v_new_pos FROM public.club_members WHERE id = p.loser_member_id;

  v_ok := public.ladder_move_apply_now(p.club_id, p.winner_member_id, p.loser_member_id, p.movement);

  UPDATE public.ladder_moves_pending
     SET status = CASE WHEN v_ok THEN 'approved' ELSE 'rejected' END,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = _pending_id;

  IF v_ok THEN
    INSERT INTO public.ladder_adjustment_log
      (club_id, member_id, old_position, new_position, reason, adjusted_by)
    VALUES (p.club_id, p.winner_member_id, p.winner_position, v_new_pos,
            'Approved ladder move from ' || COALESCE(p.source,'competition') || ' result', auth.uid());
  END IF;

  RETURN v_ok;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_ladder_move_pending(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_ladder_move_pending(_pending_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club uuid;
BEGIN
  SELECT club_id INTO v_club FROM public.ladder_moves_pending WHERE id = _pending_id AND status = 'pending';
  IF v_club IS NULL THEN RETURN false; END IF;
  IF NOT public.is_club_admin(auth.uid(), v_club) THEN
    RAISE EXCEPTION 'Not authorised to reject ladder moves for this club';
  END IF;

  UPDATE public.ladder_moves_pending
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = _pending_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_ladder_move_pending(uuid) TO authenticated;
