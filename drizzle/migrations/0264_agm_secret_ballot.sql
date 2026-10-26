CREATE TABLE public.agm_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  declaration text NOT NULL DEFAULT '',
  deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open')),
  opened_at timestamptz,
  eligible_count int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agm_ballot_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id uuid NOT NULL REFERENCES public.agm_ballots(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort int NOT NULL DEFAULT 0
);
CREATE TABLE public.agm_ballot_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.agm_ballot_positions(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort int NOT NULL DEFAULT 0
);
-- Who may vote / has voted. Never linked to choices.
CREATE TABLE public.agm_ballot_voters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id uuid NOT NULL REFERENCES public.agm_ballots(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id),
  token_hash bytea NOT NULL UNIQUE,
  declared_at timestamptz,
  voted_at timestamptz,
  UNIQUE (ballot_id, club_member_id)
);
-- Anonymous ballots: no member reference and no timestamps.
CREATE TABLE public.agm_ballot_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id uuid NOT NULL REFERENCES public.agm_ballots(id) ON DELETE CASCADE,
  receipt_code text NOT NULL UNIQUE
);
CREATE TABLE public.agm_ballot_votes (
  receipt_id uuid NOT NULL REFERENCES public.agm_ballot_receipts(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES public.agm_ballot_positions(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.agm_ballot_candidates(id) ON DELETE CASCADE,
  PRIMARY KEY (receipt_id, position_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agm_ballots, public.agm_ballot_positions, public.agm_ballot_candidates TO authenticated;
GRANT ALL ON public.agm_ballots, public.agm_ballot_positions, public.agm_ballot_candidates,
  public.agm_ballot_voters, public.agm_ballot_receipts, public.agm_ballot_votes TO service_role;

ALTER TABLE public.agm_ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agm_ballot_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agm_ballot_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agm_ballot_voters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agm_ballot_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agm_ballot_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read ballots" ON public.agm_ballots FOR SELECT TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "Admins create draft ballots" ON public.agm_ballots FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) AND status = 'draft');
CREATE POLICY "Admins edit draft ballots" ON public.agm_ballots FOR UPDATE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) AND status = 'draft')
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) AND status = 'draft');
CREATE POLICY "Admins delete draft ballots" ON public.agm_ballots FOR DELETE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) AND status = 'draft');

CREATE OR REPLACE FUNCTION public._agm_ballot_admin(_ballot uuid, _draft_only boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM agm_ballots b WHERE b.id = _ballot
    AND is_club_admin(auth.uid(), b.club_id) AND (NOT _draft_only OR b.status = 'draft'))
$$;

CREATE POLICY "Admins read positions" ON public.agm_ballot_positions FOR SELECT TO authenticated
  USING (public._agm_ballot_admin(ballot_id, false));
CREATE POLICY "Admins write draft positions" ON public.agm_ballot_positions FOR ALL TO authenticated
  USING (public._agm_ballot_admin(ballot_id, true)) WITH CHECK (public._agm_ballot_admin(ballot_id, true));
CREATE POLICY "Admins read candidates" ON public.agm_ballot_candidates FOR SELECT TO authenticated
  USING (public._agm_ballot_admin((SELECT ballot_id FROM public.agm_ballot_positions p WHERE p.id = position_id), false));
CREATE POLICY "Admins write draft candidates" ON public.agm_ballot_candidates FOR ALL TO authenticated
  USING (public._agm_ballot_admin((SELECT ballot_id FROM public.agm_ballot_positions p WHERE p.id = position_id), true))
  WITH CHECK (public._agm_ballot_admin((SELECT ballot_id FROM public.agm_ballot_positions p WHERE p.id = position_id), true));

-- Age from a 13-digit SA ID (YYMMDD...). NULL when unknown.
CREATE OR REPLACE FUNCTION public._agm_age_from_sa_id(_id text)
RETURNS int LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE yy int; d date; cur int := extract(year from now())::int % 100;
BEGIN
  IF _id IS NULL OR _id !~ '^\d{13}$' THEN RETURN NULL; END IF;
  yy := substr(_id,1,2)::int;
  BEGIN
    d := make_date(CASE WHEN yy > cur THEN 1900 + yy ELSE 2000 + yy END, substr(_id,3,2)::int, substr(_id,5,2)::int);
  EXCEPTION WHEN others THEN RETURN NULL; END;
  RETURN extract(year from age(now()::date, d))::int;
END $$;

-- Admin preview of potential voters with suggested eligibility.
CREATE OR REPLACE FUNCTION public.agm_voter_candidates(p_club_id uuid)
RETURNS TABLE(club_member_id uuid, name text, member_number text, email text, age int, annual_fee_paid boolean, has_fee_record boolean, suggested boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_club_admin(auth.uid(), p_club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  RETURN QUERY
  WITH m AS (
    SELECT cm.id, cm.name, cm.club_member_number::text AS num, cm.email, _agm_age_from_sa_id(cm.id_number) AS age
    FROM club_members cm
    WHERE cm.club_id = p_club_id AND cm.status = 'active' AND cm.role <> 'visitor'
  ), f AS (
    SELECT fp.club_member_id AS mid,
      bool_or(fp.paid) FILTER (WHERE fp.fee_type NOT IN ('tournament_entry')) AS paid,
      count(*) FILTER (WHERE fp.fee_type NOT IN ('tournament_entry')) > 0 AS has_rec
    FROM club_member_fee_payments fp
    WHERE fp.club_member_id IN (SELECT id FROM m)
      AND coalesce(fp.season_year, extract(year from now())::int) >= extract(year from now())::int
    GROUP BY fp.club_member_id
  )
  SELECT m.id, m.name, m.num, m.email, m.age, coalesce(f.paid, false), coalesce(f.has_rec, false),
    (coalesce(m.age, 18) >= 18 AND (coalesce(f.paid, false) OR NOT coalesce(f.has_rec, false)))
  FROM m LEFT JOIN f ON f.mid = m.id
  ORDER BY m.name;
END $$;

-- Open a draft ballot for the confirmed voter list; returns one-time raw tokens.
CREATE OR REPLACE FUNCTION public.agm_open_ballot(p_ballot_id uuid, p_member_ids uuid[])
RETURNS TABLE(club_member_id uuid, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE b agm_ballots; mid uuid; t text; n int := 0;
BEGIN
  SELECT * INTO b FROM agm_ballots WHERE id = p_ballot_id FOR UPDATE;
  IF b.id IS NULL OR NOT is_club_admin(auth.uid(), b.club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF b.status <> 'draft' THEN RAISE EXCEPTION 'Ballot is already open'; END IF;
  IF b.deadline <= now() THEN RAISE EXCEPTION 'Deadline must be in the future'; END IF;
  IF NOT EXISTS (SELECT 1 FROM agm_ballot_positions WHERE ballot_id = b.id) THEN RAISE EXCEPTION 'Add at least one position'; END IF;
  IF EXISTS (SELECT 1 FROM agm_ballot_positions p WHERE p.ballot_id = b.id
      AND NOT EXISTS (SELECT 1 FROM agm_ballot_candidates c WHERE c.position_id = p.id)) THEN
    RAISE EXCEPTION 'Every position needs at least one nominee';
  END IF;
  FOREACH mid IN ARRAY coalesce(p_member_ids, '{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM club_members cm WHERE cm.id = mid AND cm.club_id = b.club_id AND cm.status = 'active') THEN
      RAISE EXCEPTION 'Voter % is not an active member of this club', mid;
    END IF;
    IF EXISTS (SELECT 1 FROM agm_ballot_voters v WHERE v.ballot_id = b.id AND v.club_member_id = mid) THEN CONTINUE; END IF;
    t := encode(gen_random_bytes(24), 'hex');
    INSERT INTO agm_ballot_voters(ballot_id, club_member_id, token_hash) VALUES (b.id, mid, digest(t, 'sha256'));
    n := n + 1;
    club_member_id := mid; token := t; RETURN NEXT;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'Select at least one voter'; END IF;
  UPDATE agm_ballots SET status = 'open', opened_at = now(), eligible_count = n WHERE id = b.id;
END $$;

-- Replace a lost link for a voter who has not voted yet.
CREATE OR REPLACE FUNCTION public.agm_reissue_token(p_ballot_id uuid, p_member_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE b agm_ballots; t text;
BEGIN
  SELECT * INTO b FROM agm_ballots WHERE id = p_ballot_id;
  IF b.id IS NULL OR NOT is_club_admin(auth.uid(), b.club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF b.status <> 'open' OR b.deadline <= now() THEN RAISE EXCEPTION 'Voting is closed'; END IF;
  t := encode(gen_random_bytes(24), 'hex');
  UPDATE agm_ballot_voters SET token_hash = digest(t, 'sha256')
   WHERE ballot_id = b.id AND club_member_id = p_member_id AND voted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This member is not on the voter list or has already voted'; END IF;
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION public.agm_extend_deadline(p_ballot_id uuid, p_deadline timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b agm_ballots;
BEGIN
  SELECT * INTO b FROM agm_ballots WHERE id = p_ballot_id FOR UPDATE;
  IF b.id IS NULL OR NOT is_club_admin(auth.uid(), b.club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF b.status = 'open' AND b.deadline <= now() THEN RAISE EXCEPTION 'Voting has closed and cannot be reopened'; END IF;
  IF b.status = 'open' AND p_deadline <= b.deadline THEN RAISE EXCEPTION 'The deadline can only be extended'; END IF;
  IF p_deadline <= now() THEN RAISE EXCEPTION 'Deadline must be in the future'; END IF;
  UPDATE agm_ballots SET deadline = p_deadline WHERE id = b.id;
END $$;

-- Public: load ballot for a voting link.
CREATE OR REPLACE FUNCTION public.agm_ballot_for_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v agm_ballot_voters; b agm_ballots; cm club_members; c clubs;
BEGIN
  SELECT * INTO v FROM agm_ballot_voters WHERE token_hash = digest(coalesce(p_token,''), 'sha256');
  IF v.id IS NULL THEN RETURN jsonb_build_object('state', 'invalid'); END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = v.ballot_id;
  SELECT * INTO cm FROM club_members WHERE id = v.club_member_id;
  SELECT * INTO c FROM clubs WHERE id = b.club_id;
  RETURN jsonb_build_object(
    'state', CASE WHEN v.voted_at IS NOT NULL THEN 'voted' WHEN b.deadline <= now() THEN 'closed' ELSE 'open' END,
    'title', b.title, 'declaration', b.declaration, 'deadline', b.deadline, 'club_name', c.name,
    'voter', jsonb_build_object('name', cm.name, 'member_number', cm.club_member_number, 'email', cm.email),
    'positions', CASE WHEN v.voted_at IS NULL AND b.deadline > now() THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title,
        'candidates', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.sort, x.name), '[]')
                        FROM agm_ballot_candidates x WHERE x.position_id = p.id)) ORDER BY p.sort), '[]')
      FROM agm_ballot_positions p WHERE p.ballot_id = b.id) ELSE '[]'::jsonb END);
END $$;

-- Public: cast one anonymous ballot. p_choices = {"<position_id>": "<candidate_id>" | null}
CREATE OR REPLACE FUNCTION public.agm_cast_vote(p_token text, p_declared boolean, p_choices jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v agm_ballot_voters; b agm_ballots; r uuid; code text; p record; cand uuid; raw text;
BEGIN
  SELECT * INTO v FROM agm_ballot_voters WHERE token_hash = digest(coalesce(p_token,''), 'sha256') FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'This voting link is not valid'; END IF;
  IF v.voted_at IS NOT NULL THEN RAISE EXCEPTION 'You have already voted'; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = v.ballot_id;
  IF b.status <> 'open' OR b.deadline <= now() THEN RAISE EXCEPTION 'Voting has closed'; END IF;
  IF NOT coalesce(p_declared, false) THEN RAISE EXCEPTION 'Please confirm the membership declaration'; END IF;
  IF jsonb_typeof(p_choices) <> 'object' THEN RAISE EXCEPTION 'Invalid ballot'; END IF;

  code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 4) || '-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 4));
  INSERT INTO agm_ballot_receipts(ballot_id, receipt_code) VALUES (b.id, code) RETURNING id INTO r;
  FOR p IN SELECT id FROM agm_ballot_positions WHERE ballot_id = b.id LOOP
    raw := p_choices ->> p.id::text;
    cand := NULL;
    IF raw IS NOT NULL AND raw <> '' THEN
      SELECT x.id INTO cand FROM agm_ballot_candidates x WHERE x.position_id = p.id AND x.id::text = raw;
      IF cand IS NULL THEN RAISE EXCEPTION 'Invalid choice on ballot'; END IF;
    END IF;
    INSERT INTO agm_ballot_votes(receipt_id, position_id, candidate_id) VALUES (r, p.id, cand);
  END LOOP;
  UPDATE agm_ballot_voters SET voted_at = now(), declared_at = now() WHERE id = v.id;
  RETURN code;
END $$;

-- Admin: turnout (always) and who has voted (names only, never choices).
CREATE OR REPLACE FUNCTION public.agm_ballot_turnout(p_ballot_id uuid)
RETURNS TABLE(club_member_id uuid, name text, voted boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _agm_ballot_admin(p_ballot_id, false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  RETURN QUERY SELECT v.club_member_id, cm.name, v.voted_at IS NOT NULL
    FROM agm_ballot_voters v JOIN club_members cm ON cm.id = v.club_member_id
    WHERE v.ballot_id = p_ballot_id ORDER BY cm.name;
END $$;

-- Admin: results only after the deadline.
CREATE OR REPLACE FUNCTION public.agm_ballot_results(p_ballot_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b agm_ballots;
BEGIN
  SELECT * INTO b FROM agm_ballots WHERE id = p_ballot_id;
  IF b.id IS NULL OR NOT is_club_admin(auth.uid(), b.club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF b.status <> 'open' OR b.deadline > now() THEN RAISE EXCEPTION 'Results are available after the voting deadline'; END IF;
  RETURN jsonb_build_object(
    'eligible', (SELECT count(*) FROM agm_ballot_voters WHERE ballot_id = b.id),
    'voted', (SELECT count(*) FROM agm_ballot_voters WHERE ballot_id = b.id AND voted_at IS NOT NULL),
    'ballots', (SELECT count(*) FROM agm_ballot_receipts WHERE ballot_id = b.id),
    'positions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title,
       'abstain', (SELECT count(*) FROM agm_ballot_votes vv WHERE vv.position_id = p.id AND vv.candidate_id IS NULL),
       'tally', (SELECT coalesce(jsonb_agg(jsonb_build_object('candidate_id', x.id, 'name', x.name,
            'votes', (SELECT count(*) FROM agm_ballot_votes vv WHERE vv.candidate_id = x.id)) ORDER BY x.sort, x.name), '[]')
          FROM agm_ballot_candidates x WHERE x.position_id = p.id)) ORDER BY p.sort), '[]')
       FROM agm_ballot_positions p WHERE p.ballot_id = b.id),
    'receipts', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', rc.receipt_code,
       'choices', (SELECT jsonb_object_agg(vv.position_id::text, vv.candidate_id) FROM agm_ballot_votes vv WHERE vv.receipt_id = rc.id))
       ORDER BY rc.receipt_code), '[]') FROM agm_ballot_receipts rc WHERE rc.ballot_id = b.id));
END $$;

REVOKE ALL ON FUNCTION public._agm_ballot_admin(uuid, boolean), public.agm_voter_candidates(uuid), public.agm_open_ballot(uuid, uuid[]),
  public.agm_reissue_token(uuid, uuid), public.agm_extend_deadline(uuid, timestamptz), public.agm_ballot_turnout(uuid),
  public.agm_ballot_results(uuid), public.agm_ballot_for_token(text), public.agm_cast_vote(text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._agm_ballot_admin(uuid, boolean), public.agm_voter_candidates(uuid), public.agm_open_ballot(uuid, uuid[]),
  public.agm_reissue_token(uuid, uuid), public.agm_extend_deadline(uuid, timestamptz), public.agm_ballot_turnout(uuid),
  public.agm_ballot_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agm_ballot_for_token(text), public.agm_cast_vote(text, boolean, jsonb) TO anon, authenticated;