-- 1. Organiser lock switch for doubles pairing
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS doubles_pairing_locked boolean NOT NULL DEFAULT false;

-- 2. Pair table
CREATE TABLE IF NOT EXISTS public.champ_doubles_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champ_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  group_number int NOT NULL,
  member_a uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  member_b uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  responded_by uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT champ_doubles_pairs_status_chk CHECK (status IN ('pending','confirmed','rejected','cancelled')),
  CONSTRAINT champ_doubles_pairs_distinct_chk CHECK (member_a <> member_b)
);

GRANT SELECT ON public.champ_doubles_pairs TO authenticated;
GRANT ALL ON public.champ_doubles_pairs TO service_role;

ALTER TABLE public.champ_doubles_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organisers and participants read doubles pairs" ON public.champ_doubles_pairs;
CREATE POLICY "Organisers and participants read doubles pairs"
ON public.champ_doubles_pairs FOR SELECT TO authenticated
USING (
  public.can_manage_tournament(champ_id)
  OR EXISTS (
    SELECT 1 FROM public.club_members m
     WHERE m.id IN (member_a, member_b) AND m.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS champ_doubles_pairs_champ_idx ON public.champ_doubles_pairs(champ_id, group_number);
CREATE INDEX IF NOT EXISTS champ_doubles_pairs_member_a_idx ON public.champ_doubles_pairs(member_a);
CREATE INDEX IF NOT EXISTS champ_doubles_pairs_member_b_idx ON public.champ_doubles_pairs(member_b);

-- one active (pending/confirmed) proposal per ordered pair per division
CREATE UNIQUE INDEX IF NOT EXISTS champ_doubles_pairs_active_uq
  ON public.champ_doubles_pairs(champ_id, group_number, member_a, member_b)
  WHERE status IN ('pending','confirmed');

CREATE OR REPLACE FUNCTION public.champ_doubles_pairs_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS champ_doubles_pairs_touch ON public.champ_doubles_pairs;
CREATE TRIGGER champ_doubles_pairs_touch BEFORE UPDATE ON public.champ_doubles_pairs
FOR EACH ROW EXECUTE FUNCTION public.champ_doubles_pairs_touch();

-- no player may hold two confirmed pairs in the same division
CREATE OR REPLACE FUNCTION public.champ_doubles_pairs_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    IF EXISTS (
      SELECT 1 FROM public.champ_doubles_pairs p
       WHERE p.id <> NEW.id
         AND p.champ_id = NEW.champ_id
         AND p.group_number = NEW.group_number
         AND p.status = 'confirmed'
         AND (p.member_a IN (NEW.member_a, NEW.member_b) OR p.member_b IN (NEW.member_a, NEW.member_b))
    ) THEN
      RAISE EXCEPTION 'One of these players is already paired in this division';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS champ_doubles_pairs_guard ON public.champ_doubles_pairs;
CREATE TRIGGER champ_doubles_pairs_guard BEFORE INSERT OR UPDATE ON public.champ_doubles_pairs
FOR EACH ROW EXECUTE FUNCTION public.champ_doubles_pairs_guard();

-- 3. Helpers -----------------------------------------------------------------

-- resolve the acting member from an invite token (public) or the signed-in user
CREATE OR REPLACE FUNCTION public.champ_actor_member(p_champ_id uuid, p_token text, p_verify text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg record; v_member uuid;
BEGIN
  IF p_token IS NOT NULL AND length(p_token) >= 32 THEN
    SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
    IF NOT FOUND OR v_reg.invite_revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'This invitation link is not valid';
    END IF;
    IF p_champ_id IS NOT NULL AND v_reg.champ_id <> p_champ_id THEN
      RAISE EXCEPTION 'This invitation link is not valid';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = v_reg.club_member_id AND m.user_id = auth.uid()) THEN
      IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
        RAISE EXCEPTION 'We could not verify that this invitation is yours. Please check the detail you entered.';
      END IF;
    END IF;
    RETURN v_reg.club_member_id;
  END IF;

  SELECT r.club_member_id INTO v_member
    FROM public.club_champs_registrations r
    JOIN public.club_members m ON m.id = r.club_member_id
   WHERE r.champ_id = p_champ_id AND m.user_id = auth.uid()
   LIMIT 1;
  IF v_member IS NULL THEN RAISE EXCEPTION 'You are not registered for this tournament'; END IF;
  RETURN v_member;
END; $$;

CREATE OR REPLACE FUNCTION public.champ_division_is_doubles(p_champ_id uuid, p_group_number int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.tournament_division_options(p_champ_id, NULL)) d
     WHERE (d ->> 'group_number')::int = p_group_number
       AND lower(COALESCE(d ->> 'match_type', '')) = 'doubles'
  );
$$;

CREATE OR REPLACE FUNCTION public.champ_member_accepted(p_champ_id uuid, p_member_id uuid, p_group_number int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_champs_registrations r
     WHERE r.champ_id = p_champ_id
       AND r.club_member_id = p_member_id
       AND r.confirmed_at IS NOT NULL
       AND lower(COALESCE(r.status, '')) <> 'cancelled'
       AND (p_group_number IS NULL OR p_group_number = ANY (COALESCE(r.division_choices, '{}')))
  );
$$;

CREATE OR REPLACE FUNCTION public.champ_pairing_locked(p_champ_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT doubles_pairing_locked FROM public.tournaments WHERE id = p_champ_id), false);
$$;

-- keep the division entry in sync so allocation/draw sees the pair
CREATE OR REPLACE FUNCTION public.champ_sync_pair_entries(p_champ_id uuid, p_group_number int, p_a uuid, p_b uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.club_champs_entries SET partner_member_id = p_b
   WHERE champ_id = p_champ_id AND group_number = p_group_number AND club_member_id = p_a;
  UPDATE public.club_champs_entries SET partner_member_id = p_a
   WHERE champ_id = p_champ_id AND group_number = p_group_number AND club_member_id = p_b;
END; $$;

-- 4. Player-facing RPCs -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_doubles_partner_options(
  p_champ_id uuid, p_group_number int, p_token text DEFAULT NULL,
  p_verify text DEFAULT NULL, p_search text DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid; v_rows jsonb;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x ->> 'display_name'), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
             'member_id', m.id,
             'display_name', m.name,
             'club_id', m.club_id,
             'club_name', c.name,
             'gender', m.gender,
             'ladder_position', m.ladder_position
           ) AS x
      FROM public.club_champs_registrations r
      JOIN public.club_members m ON m.id = r.club_member_id
      LEFT JOIN public.clubs c ON c.id = m.club_id
     WHERE r.champ_id = p_champ_id
       AND m.id <> v_me
       AND r.confirmed_at IS NOT NULL
       AND lower(COALESCE(r.status, '')) <> 'cancelled'
       AND p_group_number = ANY (COALESCE(r.division_choices, '{}'))
       AND (p_search IS NULL OR trim(p_search) = '' OR m.name ILIKE '%' || trim(p_search) || '%')
       AND NOT EXISTS (
         SELECT 1 FROM public.champ_doubles_pairs p
          WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number
            AND p.status = 'confirmed' AND m.id IN (p.member_a, p.member_b)
       )
     LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  ) s;
  RETURN v_rows;
END; $$;

CREATE OR REPLACE FUNCTION public.get_doubles_pairing_state(
  p_champ_id uuid, p_token text DEFAULT NULL, p_verify text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid; v_rows jsonb;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'group_number', p.group_number,
           'status', p.status,
           'proposed_by_me', p.proposed_by = v_me,
           'partner_member_id', CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END,
           'partner_name', pm.name,
           'partner_club', pc.name,
           'created_at', p.created_at,
           'responded_at', p.responded_at
         ) ORDER BY p.group_number, p.created_at), '[]'::jsonb)
    INTO v_rows
    FROM public.champ_doubles_pairs p
    JOIN public.club_members pm ON pm.id = CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END
    LEFT JOIN public.clubs pc ON pc.id = pm.club_id
   WHERE p.champ_id = p_champ_id
     AND v_me IN (p.member_a, p.member_b)
     AND p.status IN ('pending','confirmed');

  RETURN jsonb_build_object('member_id', v_me, 'locked', public.champ_pairing_locked(p_champ_id), 'pairs', v_rows);
END; $$;

CREATE OR REPLACE FUNCTION public.propose_doubles_partner(
  p_champ_id uuid, p_group_number int, p_partner_member_id uuid,
  p_token text DEFAULT NULL, p_verify text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid; v_existing record; v_id uuid; v_status text;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF v_me = p_partner_member_id THEN RAISE EXCEPTION 'You cannot pair with yourself'; END IF;
  IF public.champ_pairing_locked(p_champ_id) THEN
    RAISE EXCEPTION 'Doubles pairs are locked by the organiser';
  END IF;
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN
    RAISE EXCEPTION 'This division is not a doubles division';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_champ_id::text || ':' || p_group_number::text, 0));

  IF NOT public.champ_member_accepted(p_champ_id, v_me, p_group_number) THEN
    RAISE EXCEPTION 'Please complete your own registration for this division first';
  END IF;
  IF NOT public.champ_member_accepted(p_champ_id, p_partner_member_id, p_group_number) THEN
    RAISE EXCEPTION 'Your partner must register first before you can select them.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number AND p.status = 'confirmed'
       AND (p.member_a IN (v_me, p_partner_member_id) OR p.member_b IN (v_me, p_partner_member_id))
  ) THEN
    RAISE EXCEPTION 'One of these players is already paired in this division';
  END IF;

  -- mutual proposal -> confirm immediately
  SELECT * INTO v_existing FROM public.champ_doubles_pairs p
   WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number AND p.status = 'pending'
     AND p.member_a = p_partner_member_id AND p.member_b = v_me
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.champ_doubles_pairs
       SET status = 'confirmed', responded_at = now(), responded_by = v_me
     WHERE id = v_existing.id;
    PERFORM public.champ_sync_pair_entries(p_champ_id, p_group_number, v_existing.member_a, v_existing.member_b);
    RETURN jsonb_build_object('id', v_existing.id, 'status', 'confirmed');
  END IF;

  -- replace my own outstanding proposal in this division
  UPDATE public.champ_doubles_pairs
     SET status = 'cancelled', responded_at = now(), responded_by = v_me
   WHERE champ_id = p_champ_id AND group_number = p_group_number AND status = 'pending'
     AND proposed_by = v_me;

  INSERT INTO public.champ_doubles_pairs (champ_id, group_number, member_a, member_b, proposed_by, status)
  VALUES (p_champ_id, p_group_number, v_me, p_partner_member_id, v_me, 'pending')
  RETURNING id, status INTO v_id, v_status;

  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END; $$;

CREATE OR REPLACE FUNCTION public.respond_doubles_pair(
  p_pair_id uuid, p_accept boolean, p_token text DEFAULT NULL, p_verify text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pair record; v_me uuid;
BEGIN
  SELECT * INTO v_pair FROM public.champ_doubles_pairs WHERE id = p_pair_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This pairing no longer exists'; END IF;

  v_me := public.champ_actor_member(v_pair.champ_id, p_token, p_verify);
  IF v_me NOT IN (v_pair.member_a, v_pair.member_b) THEN RAISE EXCEPTION 'This pairing is not yours'; END IF;
  IF v_pair.status <> 'pending' THEN
    RETURN jsonb_build_object('id', v_pair.id, 'status', v_pair.status, 'already', true);
  END IF;
  IF v_me = v_pair.proposed_by AND p_accept THEN
    RAISE EXCEPTION 'Your partner still has to accept this pairing';
  END IF;
  IF public.champ_pairing_locked(v_pair.champ_id) THEN
    RAISE EXCEPTION 'Doubles pairs are locked by the organiser';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_pair.champ_id::text || ':' || v_pair.group_number::text, 0));

  IF NOT p_accept THEN
    UPDATE public.champ_doubles_pairs
       SET status = CASE WHEN v_me = v_pair.proposed_by THEN 'cancelled' ELSE 'rejected' END,
           responded_at = now(), responded_by = v_me
     WHERE id = v_pair.id;
    RETURN jsonb_build_object('id', v_pair.id, 'status', 'rejected');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = v_pair.champ_id AND p.group_number = v_pair.group_number
       AND p.status = 'confirmed'
       AND (p.member_a IN (v_pair.member_a, v_pair.member_b) OR p.member_b IN (v_pair.member_a, v_pair.member_b))
  ) THEN
    RAISE EXCEPTION 'One of these players is already paired in this division';
  END IF;

  UPDATE public.champ_doubles_pairs
     SET status = 'confirmed', responded_at = now(), responded_by = v_me
   WHERE id = v_pair.id;

  -- any other outstanding proposals for these two players fall away
  UPDATE public.champ_doubles_pairs
     SET status = 'cancelled', responded_at = now(), responded_by = v_me
   WHERE champ_id = v_pair.champ_id AND group_number = v_pair.group_number
     AND id <> v_pair.id AND status = 'pending'
     AND (member_a IN (v_pair.member_a, v_pair.member_b) OR member_b IN (v_pair.member_a, v_pair.member_b));

  PERFORM public.champ_sync_pair_entries(v_pair.champ_id, v_pair.group_number, v_pair.member_a, v_pair.member_b);
  RETURN jsonb_build_object('id', v_pair.id, 'status', 'confirmed');
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_doubles_pair(
  p_pair_id uuid, p_token text DEFAULT NULL, p_verify text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pair record; v_me uuid;
BEGIN
  SELECT * INTO v_pair FROM public.champ_doubles_pairs WHERE id = p_pair_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This pairing no longer exists'; END IF;
  v_me := public.champ_actor_member(v_pair.champ_id, p_token, p_verify);
  IF v_me NOT IN (v_pair.member_a, v_pair.member_b) THEN RAISE EXCEPTION 'This pairing is not yours'; END IF;
  IF v_pair.status NOT IN ('pending','confirmed') THEN
    RETURN jsonb_build_object('id', v_pair.id, 'status', v_pair.status, 'already', true);
  END IF;
  IF public.champ_pairing_locked(v_pair.champ_id) THEN
    RAISE EXCEPTION 'Doubles pairs are locked by the organiser — ask them to reopen pairing';
  END IF;

  UPDATE public.champ_doubles_pairs
     SET status = 'cancelled', responded_at = now(), responded_by = v_me
   WHERE id = v_pair.id;

  IF v_pair.status = 'confirmed' THEN
    PERFORM public.champ_sync_pair_entries(v_pair.champ_id, v_pair.group_number, NULL, NULL);
    UPDATE public.club_champs_entries SET partner_member_id = NULL
     WHERE champ_id = v_pair.champ_id AND group_number = v_pair.group_number
       AND club_member_id IN (v_pair.member_a, v_pair.member_b);
  END IF;

  RETURN jsonb_build_object('id', v_pair.id, 'status', 'cancelled');
END; $$;

-- 5. Organiser view -----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tournament_doubles_pairs(p_champ_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.can_manage_tournament(p_champ_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'group_number', p.group_number, 'status', p.status,
           'member_a', p.member_a, 'member_a_name', a.name,
           'member_b', p.member_b, 'member_b_name', b.name,
           'proposed_by', p.proposed_by,
           'created_at', p.created_at, 'responded_at', p.responded_at
         ) ORDER BY p.group_number, p.created_at), '[]'::jsonb)
    INTO v_rows
    FROM public.champ_doubles_pairs p
    JOIN public.club_members a ON a.id = p.member_a
    JOIN public.club_members b ON b.id = p.member_b
   WHERE p.champ_id = p_champ_id;
  RETURN jsonb_build_object('locked', public.champ_pairing_locked(p_champ_id), 'pairs', v_rows);
END; $$;

CREATE OR REPLACE FUNCTION public.set_doubles_pairing_locked(p_champ_id uuid, p_locked boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_tournament(p_champ_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.tournaments SET doubles_pairing_locked = COALESCE(p_locked, false) WHERE id = p_champ_id;
  RETURN COALESCE(p_locked, false);
END; $$;

GRANT EXECUTE ON FUNCTION public.list_doubles_partner_options(uuid,int,text,text,text,int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_doubles_pairing_state(uuid,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propose_doubles_partner(uuid,int,uuid,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_doubles_pair(uuid,boolean,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_doubles_pair(uuid,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_doubles_pairs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_doubles_pairing_locked(uuid,boolean) TO authenticated;