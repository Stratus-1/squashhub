ALTER TABLE public.agm_ballot_positions ADD COLUMN max_choices int NOT NULL DEFAULT 1;
ALTER TABLE public.agm_ballot_positions ADD CONSTRAINT agm_positions_max_choices_range CHECK (max_choices BETWEEN 1 AND 20);

ALTER TABLE public.agm_ballot_votes DROP CONSTRAINT agm_ballot_votes_pkey;
CREATE UNIQUE INDEX agm_votes_one_per_candidate ON public.agm_ballot_votes(receipt_id, candidate_id) WHERE candidate_id IS NOT NULL;
CREATE UNIQUE INDEX agm_votes_one_abstain ON public.agm_ballot_votes(receipt_id, position_id) WHERE candidate_id IS NULL;
CREATE INDEX agm_votes_receipt_position ON public.agm_ballot_votes(receipt_id, position_id);

CREATE OR REPLACE FUNCTION public._agm_positions_json(p_ballot_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'max_choices', p.max_choices,
    'candidates', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.sort, x.name), '[]')
                    FROM agm_ballot_candidates x WHERE x.position_id = p.id)) ORDER BY p.sort), '[]')
  FROM agm_ballot_positions p WHERE p.ballot_id = p_ballot_id
$$;
REVOKE ALL ON FUNCTION public._agm_positions_json(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agm_ballot_for_token(p_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v agm_ballot_voters; b agm_ballots; cm club_members; c clubs; pv agm_preview_tokens;
BEGIN
  SELECT * INTO v FROM agm_ballot_voters WHERE token_hash = digest(coalesce(p_token,''), 'sha256');
  IF v.id IS NULL THEN
    SELECT * INTO pv FROM agm_preview_tokens WHERE token_hash = digest(coalesce(p_token,''), 'sha256') AND expires_at > now();
    IF pv.ballot_id IS NULL THEN RETURN jsonb_build_object('state', 'invalid'); END IF;
    SELECT * INTO b FROM agm_ballots WHERE id = pv.ballot_id;
    SELECT * INTO cm FROM club_members WHERE id = pv.club_member_id;
    SELECT * INTO c FROM clubs WHERE id = b.club_id;
    RETURN jsonb_build_object('state','open','preview',true,
      'title', b.title, 'declaration', b.declaration, 'deadline', b.deadline, 'club_name', c.name,
      'voter', jsonb_build_object('name', cm.name, 'member_number', cm.club_member_number, 'email', cm.email),
      'positions', _agm_positions_json(b.id));
  END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = v.ballot_id;
  SELECT * INTO cm FROM club_members WHERE id = v.club_member_id;
  SELECT * INTO c FROM clubs WHERE id = b.club_id;
  RETURN jsonb_build_object(
    'state', CASE WHEN v.voted_at IS NOT NULL THEN 'voted' WHEN b.deadline <= now() THEN 'closed' ELSE 'open' END,
    'title', b.title, 'declaration', b.declaration, 'deadline', b.deadline, 'club_name', c.name,
    'voter', jsonb_build_object('name', cm.name, 'member_number', cm.club_member_number, 'email', cm.email),
    'positions', CASE WHEN v.voted_at IS NULL AND b.deadline > now() THEN _agm_positions_json(b.id) ELSE '[]'::jsonb END);
END $function$;

-- p_choices = {"<position_id>": "<candidate_id>" | ["<candidate_id>", ...] | null}
CREATE OR REPLACE FUNCTION public.agm_cast_vote(p_token text, p_declared boolean, p_choices jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v agm_ballot_voters; b agm_ballots; r uuid; code text; p record; cand uuid; val jsonb; picks text[]; raw text;
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
  FOR p IN SELECT id, title, max_choices FROM agm_ballot_positions WHERE ballot_id = b.id LOOP
    val := p_choices -> p.id::text;
    IF val IS NULL OR jsonb_typeof(val) = 'null' THEN picks := ARRAY[]::text[];
    ELSIF jsonb_typeof(val) = 'string' THEN picks := CASE WHEN val #>> '{}' = '' THEN ARRAY[]::text[] ELSE ARRAY[val #>> '{}'] END;
    ELSIF jsonb_typeof(val) = 'array' THEN SELECT coalesce(array_agg(e), ARRAY[]::text[]) INTO picks FROM jsonb_array_elements_text(val) e;
    ELSE RAISE EXCEPTION 'Invalid ballot'; END IF;
    IF cardinality(picks) > p.max_choices THEN RAISE EXCEPTION 'Too many choices for %', p.title; END IF;
    IF cardinality(picks) <> (SELECT count(DISTINCT x) FROM unnest(picks) x) THEN RAISE EXCEPTION 'Duplicate choice for %', p.title; END IF;
    IF cardinality(picks) = 0 THEN
      INSERT INTO agm_ballot_votes(receipt_id, position_id, candidate_id) VALUES (r, p.id, NULL);
    ELSE
      FOREACH raw IN ARRAY picks LOOP
        SELECT x.id INTO cand FROM agm_ballot_candidates x WHERE x.position_id = p.id AND x.id::text = raw;
        IF cand IS NULL THEN RAISE EXCEPTION 'Invalid choice on ballot'; END IF;
        INSERT INTO agm_ballot_votes(receipt_id, position_id, candidate_id) VALUES (r, p.id, cand);
      END LOOP;
    END IF;
  END LOOP;
  UPDATE agm_ballot_voters SET voted_at = now(), declared_at = now() WHERE id = v.id;
  RETURN code;
END $$;

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
    'positions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'max_choices', p.max_choices,
       'abstain', (SELECT count(*) FROM agm_ballot_votes vv WHERE vv.position_id = p.id AND vv.candidate_id IS NULL),
       'tally', (SELECT coalesce(jsonb_agg(jsonb_build_object('candidate_id', x.id, 'name', x.name,
            'votes', (SELECT count(*) FROM agm_ballot_votes vv WHERE vv.candidate_id = x.id)) ORDER BY x.sort, x.name), '[]')
          FROM agm_ballot_candidates x WHERE x.position_id = p.id)) ORDER BY p.sort), '[]')
       FROM agm_ballot_positions p WHERE p.ballot_id = b.id),
    'receipts', (SELECT coalesce(jsonb_agg(jsonb_build_object('code', rc.receipt_code,
       'choices', (SELECT jsonb_object_agg(q.position_id::text, q.picks) FROM (
          SELECT vv.position_id, CASE WHEN count(vv.candidate_id) = 0 THEN NULL ELSE jsonb_agg(vv.candidate_id) FILTER (WHERE vv.candidate_id IS NOT NULL) END AS picks
          FROM agm_ballot_votes vv WHERE vv.receipt_id = rc.id GROUP BY vv.position_id) q))
       ORDER BY rc.receipt_code), '[]') FROM agm_ballot_receipts rc WHERE rc.ballot_id = b.id));
END $$;