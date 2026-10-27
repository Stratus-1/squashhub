ALTER TABLE public.agm_ballots ADD COLUMN allow_self_vote boolean NOT NULL DEFAULT false;
UPDATE public.agm_ballots SET allow_self_vote = allow_self_actions;
COMMENT ON COLUMN public.agm_ballots.allow_self_actions IS 'Admin option: when true, members may make themselves available (self-nominate). Voting for oneself is the separate allow_self_vote option.';
COMMENT ON COLUMN public.agm_ballots.allow_self_vote IS 'Admin option: when false, a voter''s own name is hidden on their ballot and self-votes are rejected.';
CREATE OR REPLACE FUNCTION public.agm_cast_vote(p_token text, p_declared boolean, p_choices jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v agm_ballot_voters; b agm_ballots; r uuid; code text; p record; cand record; val jsonb; picks text[]; raw text; vname text;
BEGIN
  SELECT * INTO v FROM agm_ballot_voters WHERE token_hash = digest(coalesce(p_token,''), 'sha256') FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'This voting link is not valid'; END IF;
  IF v.voted_at IS NOT NULL THEN RAISE EXCEPTION 'You have already voted'; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = v.ballot_id;
  IF b.status <> 'open' OR b.deadline <= now() THEN RAISE EXCEPTION 'Voting has closed'; END IF;
  IF NOT coalesce(p_declared, false) THEN RAISE EXCEPTION 'Please confirm the membership declaration'; END IF;
  IF jsonb_typeof(p_choices) <> 'object' THEN RAISE EXCEPTION 'Invalid ballot'; END IF;
  SELECT name INTO vname FROM club_members WHERE id = v.club_member_id;

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
        SELECT x.id, x.name, x.club_member_id INTO cand FROM agm_ballot_candidates x WHERE x.position_id = p.id AND x.id::text = raw;
        IF cand.id IS NULL THEN RAISE EXCEPTION 'Invalid choice on ballot'; END IF;
        IF NOT b.allow_self_vote AND (cand.club_member_id = v.club_member_id OR (cand.club_member_id IS NULL AND lower(cand.name) = lower(coalesce(vname,'')))) THEN
          RAISE EXCEPTION 'You cannot vote for yourself';
        END IF;
        INSERT INTO agm_ballot_votes(receipt_id, position_id, candidate_id) VALUES (r, p.id, cand.id);
      END LOOP;
    END IF;
  END LOOP;
  UPDATE agm_ballot_voters SET voted_at = now(), declared_at = now() WHERE id = v.id;
  RETURN code;
END $function$
;

CREATE OR REPLACE FUNCTION public.agm_ballot_for_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
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
      'positions', CASE WHEN b.allow_self_vote THEN _agm_positions_json(b.id) ELSE _agm_positions_json_excl(b.id, pv.club_member_id, cm.name) END);
  END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = v.ballot_id;
  SELECT * INTO cm FROM club_members WHERE id = v.club_member_id;
  SELECT * INTO c FROM clubs WHERE id = b.club_id;
  RETURN jsonb_build_object(
    'state', CASE WHEN v.voted_at IS NOT NULL THEN 'voted' WHEN b.deadline <= now() THEN 'closed' ELSE 'open' END,
    'title', b.title, 'declaration', b.declaration, 'deadline', b.deadline, 'club_name', c.name,
    'voter', jsonb_build_object('name', cm.name, 'member_number', cm.club_member_number, 'email', cm.email),
    'positions', CASE WHEN v.voted_at IS NULL AND b.deadline > now()
      THEN CASE WHEN b.allow_self_vote THEN _agm_positions_json(b.id) ELSE _agm_positions_json_excl(b.id, v.club_member_id, cm.name) END
      ELSE '[]'::jsonb END);
END $function$
;