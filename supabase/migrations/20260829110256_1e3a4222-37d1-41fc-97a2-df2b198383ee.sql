-- 1. Ladder configuration per club
CREATE TABLE public.ladder_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL UNIQUE REFERENCES public.clubs(id) ON DELETE CASCADE,
  format text NOT NULL DEFAULT 'standard',
  challenge_levels_up integer NOT NULL DEFAULT 2,
  pyramid_row_sizes jsonb,
  accept_deadline_hours integer NOT NULL DEFAULT 72,
  complete_deadline_days integer NOT NULL DEFAULT 14,
  max_active_outgoing integer NOT NULL DEFAULT 1,
  max_active_incoming integer NOT NULL DEFAULT 1,
  rematch_cooldown_days integer NOT NULL DEFAULT 0,
  movement_policy text NOT NULL DEFAULT 'swap',
  affects_club_ranking boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ladder_configs_format_chk CHECK (format IN ('standard','pyramid')),
  CONSTRAINT ladder_configs_movement_chk CHECK (movement_policy IN ('swap','insert')),
  CONSTRAINT ladder_configs_levels_chk CHECK (challenge_levels_up BETWEEN 1 AND 50)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ladder_configs TO authenticated;
GRANT ALL ON public.ladder_configs TO service_role;

ALTER TABLE public.ladder_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their club ladder config"
  ON public.ladder_configs FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));

CREATE POLICY "Club admins manage ladder config"
  ON public.ladder_configs FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE TRIGGER update_ladder_configs_updated_at
  BEFORE UPDATE ON public.ladder_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed every existing club, preserving current behaviour
INSERT INTO public.ladder_configs (club_id, challenge_levels_up, activated_at)
SELECT c.id, GREATEST(1, LEAST(50, COALESCE(c.challenge_levels_up, 2))), now()
FROM public.clubs c
ON CONFLICT (club_id) DO NOTHING;

-- 3. Auto-create a config for future clubs
CREATE OR REPLACE FUNCTION public.create_default_ladder_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.ladder_configs (club_id, challenge_levels_up, activated_at)
  VALUES (NEW.id, GREATEST(1, LEAST(50, COALESCE(NEW.challenge_levels_up, 2))), now())
  ON CONFLICT (club_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clubs_create_default_ladder_config
  AFTER INSERT ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.create_default_ladder_config();

-- 4. Pyramid helper: which triangular row (1-based) a ladder position falls in
CREATE OR REPLACE FUNCTION public.ladder_pyramid_row(_position integer, _row_sizes jsonb DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  r integer := 1;
  consumed integer := 0;
  sz integer;
BEGIN
  IF _position IS NULL OR _position < 1 THEN
    RETURN NULL;
  END IF;
  LOOP
    IF _row_sizes IS NOT NULL AND jsonb_typeof(_row_sizes) = 'array' AND r <= jsonb_array_length(_row_sizes) THEN
      sz := (_row_sizes ->> (r - 1))::integer;
    ELSE
      sz := r; -- triangular default: 1, 2, 3, ...
    END IF;
    IF sz IS NULL OR sz < 1 THEN
      sz := r;
    END IF;
    consumed := consumed + sz;
    IF _position <= consumed THEN
      RETURN r;
    END IF;
    r := r + 1;
    IF r > 1000 THEN
      RETURN NULL;
    END IF;
  END LOOP;
END;
$$;

-- 5. Challenge validation driven by the club configuration
CREATE OR REPLACE FUNCTION public.validate_challenge_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
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

  IF challenger_group IS DISTINCT FROM opponent_group THEN
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
$$;