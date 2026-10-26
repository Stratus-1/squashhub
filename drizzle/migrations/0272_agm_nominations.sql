ALTER TABLE public.agm_ballots
  ADD COLUMN IF NOT EXISTS nominations_status text NOT NULL DEFAULT 'none' CHECK (nominations_status IN ('none','open','closed')),
  ADD COLUMN IF NOT EXISTS nominations_close_at timestamptz;

CREATE TABLE public.agm_nominators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id uuid NOT NULL REFERENCES public.agm_ballots(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ballot_id, club_member_id)
);
CREATE TABLE public.agm_nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id uuid NOT NULL REFERENCES public.agm_ballots(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES public.agm_ballot_positions(id) ON DELETE CASCADE,
  nominee_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  nominated_by uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (position_id, nominee_member_id)
);
GRANT SELECT ON public.agm_nominators, public.agm_nominations TO authenticated;
GRANT ALL ON public.agm_nominators, public.agm_nominations TO service_role;
ALTER TABLE public.agm_nominators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agm_nominations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read nominators" ON public.agm_nominators FOR SELECT TO authenticated USING (public._agm_ballot_admin(ballot_id, false));
CREATE POLICY "Admins read nominations" ON public.agm_nominations FOR SELECT TO authenticated USING (public._agm_ballot_admin(ballot_id, false));

-- Accepted nominations become the ballot's candidates once nominations close.
CREATE OR REPLACE FUNCTION public._agm_finalize_nominations(_ballot uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b agm_ballots;
BEGIN
  SELECT * INTO b FROM agm_ballots WHERE id = _ballot FOR UPDATE;
  IF b.id IS NULL OR b.nominations_status <> 'open' OR b.nominations_close_at > now() OR b.status <> 'draft' THEN RETURN; END IF;
  DELETE FROM agm_ballot_candidates c USING agm_ballot_positions p WHERE c.position_id = p.id AND p.ballot_id = b.id;
  INSERT INTO agm_ballot_candidates (position_id, name, sort)
  SELECT n.position_id, cm.name, (row_number() OVER (PARTITION BY n.position_id ORDER BY cm.name))::int - 1
  FROM agm_nominations n JOIN club_members cm ON cm.id = n.nominee_member_id
  WHERE n.ballot_id = b.id AND n.status = 'accepted';
  UPDATE agm_ballots SET nominations_status = 'closed' WHERE id = b.id;
END $$;

CREATE OR REPLACE FUNCTION public.agm_finalize_nominations(p_ballot_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _agm_ballot_admin(p_ballot_id, false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  PERFORM _agm_finalize_nominations(p_ballot_id);
END $$;

CREATE OR REPLACE FUNCTION public.agm_open_nominations(p_ballot_id uuid, p_member_ids uuid[], p_close_at timestamptz)
RETURNS TABLE(club_member_id uuid, token text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE b agm_ballots; mid uuid; t text;
BEGIN
  SELECT * INTO b FROM agm_ballots WHERE id = p_ballot_id FOR UPDATE;
  IF b.id IS NULL OR NOT is_club_admin(auth.uid(), b.club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF b.status <> 'draft' OR b.nominations_status <> 'none' THEN RAISE EXCEPTION 'Nominations have already been opened'; END IF;
  IF p_close_at IS NULL OR p_close_at <= now() THEN RAISE EXCEPTION 'Nominations closing time must be in the future'; END IF;
  IF p_close_at >= b.deadline THEN RAISE EXCEPTION 'Nominations must close before voting closes'; END IF;
  IF NOT EXISTS (SELECT 1 FROM agm_ballot_positions WHERE ballot_id = b.id) THEN RAISE EXCEPTION 'Add at least one position'; END IF;
  FOREACH mid IN ARRAY coalesce(p_member_ids,'{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM club_members cm WHERE cm.id = mid AND cm.club_id = b.club_id AND cm.status = 'active') THEN
      RAISE EXCEPTION 'Member % is not an active member of this club', mid;
    END IF;
    t := encode(gen_random_bytes(24), 'hex');
    INSERT INTO agm_nominators (ballot_id, club_member_id, token_hash) VALUES (b.id, mid, digest(t,'sha256'));
    club_member_id := mid; token := t; RETURN NEXT;
  END LOOP;
  IF NOT FOUND AND coalesce(array_length(p_member_ids,1),0) = 0 THEN RAISE EXCEPTION 'Select at least one eligible member'; END IF;
  DELETE FROM agm_ballot_candidates c USING agm_ballot_positions p WHERE c.position_id = p.id AND p.ballot_id = b.id;
  UPDATE agm_ballots SET nominations_status = 'open', nominations_close_at = p_close_at WHERE id = b.id;
END $$;

-- Replacement personal nomination link (old link stops working).
CREATE OR REPLACE FUNCTION public.agm_reissue_nomination_token(p_ballot_id uuid, p_member_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE t text;
BEGIN
  IF NOT _agm_ballot_admin(p_ballot_id, false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  t := encode(gen_random_bytes(24), 'hex');
  UPDATE agm_nominators SET token_hash = digest(t,'sha256') WHERE ballot_id = p_ballot_id AND club_member_id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member is not on the nomination list'; END IF;
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION public._agm_nominator(_token text)
RETURNS agm_nominators LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT * FROM agm_nominators WHERE token_hash = digest(coalesce(_token,''),'sha256')
$$;

CREATE OR REPLACE FUNCTION public.agm_nomination_for_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n agm_nominators; b agm_ballots; c clubs; me club_members;
BEGIN
  n := _agm_nominator(p_token);
  IF n.id IS NULL THEN RETURN jsonb_build_object('state','invalid'); END IF;
  PERFORM _agm_finalize_nominations(n.ballot_id);
  SELECT * INTO b FROM agm_ballots WHERE id = n.ballot_id;
  SELECT * INTO c FROM clubs WHERE id = b.club_id;
  SELECT * INTO me FROM club_members WHERE id = n.club_member_id;
  RETURN jsonb_build_object('state','ok','club_name',c.name,'title',b.title,'name',me.name,'member_id',me.id,
    'close_at',b.nominations_close_at,'closed', b.nominations_status <> 'open' OR b.nominations_close_at <= now(),
    'positions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'max_choices',p.max_choices) ORDER BY p.sort),'[]') FROM agm_ballot_positions p WHERE p.ballot_id = b.id),
    'made',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'position_id',x.position_id,'nominee',cm.name,'status',x.status) ORDER BY x.created_at),'[]')
      FROM agm_nominations x JOIN club_members cm ON cm.id = x.nominee_member_id WHERE x.ballot_id = b.id AND x.nominated_by = me.id),
    'received',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'position_id',x.position_id,'by',cm.name,'self',x.nominated_by = me.id,'status',x.status) ORDER BY x.created_at),'[]')
      FROM agm_nominations x JOIN club_members cm ON cm.id = x.nominated_by WHERE x.ballot_id = b.id AND x.nominee_member_id = me.id));
END $$;

-- Search eligible members by name (min 2 letters, max 10 results).
CREATE OR REPLACE FUNCTION public.agm_search_nominees(p_token text, p_query text)
RETURNS TABLE(club_member_id uuid, name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n agm_nominators;
BEGIN
  n := _agm_nominator(p_token);
  IF n.id IS NULL OR length(trim(coalesce(p_query,''))) < 2 THEN RETURN; END IF;
  RETURN QUERY SELECT cm.id, cm.name FROM agm_nominators x JOIN club_members cm ON cm.id = x.club_member_id
    WHERE x.ballot_id = n.ballot_id AND cm.name ILIKE '%' || replace(replace(trim(p_query),'%',''),'_','') || '%'
    ORDER BY cm.name LIMIT 10;
END $$;

CREATE OR REPLACE FUNCTION public.agm_nominate(p_token text, p_position_id uuid, p_nominee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n agm_nominators; b agm_ballots;
BEGIN
  n := _agm_nominator(p_token);
  IF n.id IS NULL THEN RAISE EXCEPTION 'This nomination link is not valid'; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = n.ballot_id FOR UPDATE;
  IF b.nominations_status <> 'open' OR b.nominations_close_at <= now() THEN RAISE EXCEPTION 'Nominations are closed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM agm_ballot_positions WHERE id = p_position_id AND ballot_id = b.id) THEN RAISE EXCEPTION 'Unknown position'; END IF;
  IF NOT EXISTS (SELECT 1 FROM agm_nominators WHERE ballot_id = b.id AND club_member_id = p_nominee_id) THEN
    RAISE EXCEPTION 'This member is not eligible to be nominated';
  END IF;
  IF EXISTS (SELECT 1 FROM agm_nominations WHERE position_id = p_position_id AND nominee_member_id = p_nominee_id) THEN
    RAISE EXCEPTION 'This member has already been nominated for this position';
  END IF;
  INSERT INTO agm_nominations (ballot_id, position_id, nominee_member_id, nominated_by, status, responded_at)
  VALUES (b.id, p_position_id, p_nominee_id, n.club_member_id,
    CASE WHEN p_nominee_id = n.club_member_id THEN 'accepted' ELSE 'pending' END,
    CASE WHEN p_nominee_id = n.club_member_id THEN now() END);
END $$;

CREATE OR REPLACE FUNCTION public.agm_respond_nomination(p_token text, p_nomination_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n agm_nominators; b agm_ballots;
BEGIN
  n := _agm_nominator(p_token);
  IF n.id IS NULL THEN RAISE EXCEPTION 'This nomination link is not valid'; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = n.ballot_id;
  IF b.nominations_status <> 'open' OR b.nominations_close_at <= now() THEN RAISE EXCEPTION 'Nominations are closed'; END IF;
  UPDATE agm_nominations SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, responded_at = now()
  WHERE id = p_nomination_id AND ballot_id = b.id AND nominee_member_id = n.club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nomination not found'; END IF;
END $$;

REVOKE ALL ON FUNCTION public._agm_finalize_nominations(uuid), public._agm_nominator(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agm_finalize_nominations(uuid), public.agm_open_nominations(uuid,uuid[],timestamptz), public.agm_reissue_nomination_token(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agm_finalize_nominations(uuid), public.agm_open_nominations(uuid,uuid[],timestamptz), public.agm_reissue_nomination_token(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agm_nomination_for_token(text), public.agm_search_nominees(text,text), public.agm_nominate(text,uuid,uuid), public.agm_respond_nomination(text,uuid,boolean) TO anon, authenticated;