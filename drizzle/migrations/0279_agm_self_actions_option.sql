ALTER TABLE public.agm_ballots ADD COLUMN allow_self_actions boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.agm_ballots.allow_self_actions IS 'Admin option: when false, members cannot nominate themselves and their own name is hidden on their ballot.';

ALTER TABLE public.agm_ballot_candidates ADD COLUMN club_member_id uuid;
COMMENT ON COLUMN public.agm_ballot_candidates.club_member_id IS 'Linked member when the candidate came from nominations or an exact name match; used to hide a voter''s own name when self-voting is off.';

UPDATE public.agm_ballot_candidates c SET club_member_id = m.member_id
FROM (
  SELECT c2.id AS candidate_id, cm.id AS member_id
  FROM public.agm_ballot_candidates c2
  JOIN public.agm_ballot_positions p2 ON p2.id = c2.position_id
  JOIN public.agm_ballots b2 ON b2.id = p2.ballot_id
  JOIN public.club_members cm ON cm.club_id = b2.club_id AND lower(cm.name) = lower(c2.name)
  WHERE (SELECT count(*) FROM public.club_members x WHERE x.club_id = b2.club_id AND lower(x.name) = lower(c2.name)) = 1
) m
WHERE c.id = m.candidate_id AND c.club_member_id IS NULL;

CREATE OR REPLACE FUNCTION public._agm_positions_json_excl(p_ballot_id uuid, p_exclude_member uuid, p_exclude_name text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'max_choices', p.max_choices,
    'candidates', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.sort, x.name), '[]')
                    FROM agm_ballot_candidates x WHERE x.position_id = p.id
                      AND x.club_member_id IS DISTINCT FROM p_exclude_member
                      AND (x.club_member_id IS NOT NULL OR lower(x.name) <> lower(coalesce(p_exclude_name,''))))) ORDER BY p.sort), '[]')
  FROM agm_ballot_positions p WHERE p.ballot_id = p_ballot_id
$function$;

CREATE OR REPLACE FUNCTION public.agm_nominate(p_token text, p_position_id uuid, p_nominee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n agm_nominators; b agm_ballots;
BEGIN
  n := _agm_nominator(p_token);
  IF n.id IS NULL THEN RAISE EXCEPTION 'This nomination link is not valid'; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = n.ballot_id FOR UPDATE;
  IF b.nominations_status <> 'open' OR b.nominations_close_at <= now() THEN RAISE EXCEPTION 'Nominations are closed'; END IF;
  IF p_nominee_id = n.club_member_id AND NOT b.allow_self_actions THEN RAISE EXCEPTION 'You cannot nominate yourself'; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.agm_search_nominees(p_token text, p_query text)
RETURNS TABLE(club_member_id uuid, name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n agm_nominators; allow_self boolean;
BEGIN
  n := _agm_nominator(p_token);
  IF n.id IS NULL OR length(trim(coalesce(p_query,''))) < 2 THEN RETURN; END IF;
  SELECT b.allow_self_actions INTO allow_self FROM agm_ballots b WHERE b.id = n.ballot_id;
  RETURN QUERY SELECT cm.id, cm.name FROM agm_nominators x JOIN club_members cm ON cm.id = x.club_member_id
    WHERE x.ballot_id = n.ballot_id AND cm.name ILIKE '%' || replace(replace(trim(p_query),'%',''),'_','') || '%'
      AND (allow_self OR x.club_member_id <> n.club_member_id)
    ORDER BY cm.name LIMIT 10;
END $function$;

CREATE OR REPLACE FUNCTION public.agm_nomination_for_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n agm_nominators; b agm_ballots; c clubs; me club_members;
BEGIN
  n := _agm_nominator(p_token);
  IF n.id IS NULL THEN RETURN jsonb_build_object('state','invalid'); END IF;
  PERFORM _agm_finalize_nominations(n.ballot_id);
  SELECT * INTO b FROM agm_ballots WHERE id = n.ballot_id;
  SELECT * INTO c FROM clubs WHERE id = b.club_id;
  SELECT * INTO me FROM club_members WHERE id = n.club_member_id;
  RETURN jsonb_build_object('state','ok','club_name',c.name,'title',b.title,'name',me.name,'member_id',me.id,
    'allow_self', b.allow_self_actions,
    'close_at',b.nominations_close_at,'closed', b.nominations_status <> 'open' OR b.nominations_close_at <= now(),
    'positions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'max_choices',p.max_choices) ORDER BY p.sort),'[]') FROM agm_ballot_positions p WHERE p.ballot_id = b.id),
    'made',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'position_id',x.position_id,'nominee',cm.name,'status',x.status) ORDER BY x.created_at),'[]')
      FROM agm_nominations x JOIN club_members cm ON cm.id = x.nominee_member_id WHERE x.ballot_id = b.id AND x.nominated_by = me.id),
    'received',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'position_id',x.position_id,'by',cm.name,'self',x.nominated_by = me.id,'status',x.status) ORDER BY x.created_at),'[]')
      FROM agm_nominations x JOIN club_members cm ON cm.id = x.nominated_by WHERE x.ballot_id = b.id AND x.nominee_member_id = me.id));
END $function$;

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
      'positions', CASE WHEN b.allow_self_actions THEN _agm_positions_json(b.id) ELSE _agm_positions_json_excl(b.id, pv.club_member_id, cm.name) END);
  END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = v.ballot_id;
  SELECT * INTO cm FROM club_members WHERE id = v.club_member_id;
  SELECT * INTO c FROM clubs WHERE id = b.club_id;
  RETURN jsonb_build_object(
    'state', CASE WHEN v.voted_at IS NOT NULL THEN 'voted' WHEN b.deadline <= now() THEN 'closed' ELSE 'open' END,
    'title', b.title, 'declaration', b.declaration, b.deadline, 'club_name', c.name,
    'voter', jsonb_build_object('name', cm.name, 'member_number', cm.club_member_number, 'email', cm.email),
    'positions', CASE WHEN v.voted_at IS NULL AND b.deadline > now()
      THEN CASE WHEN b.allow_self_actions THEN _agm_positions_json(b.id) ELSE _agm_positions_json_excl(b.id, v.club_member_id, cm.name) END
      ELSE '[]'::jsonb END);
END $function$;

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
        IF NOT b.allow_self_actions AND (cand.club_member_id = v.club_member_id OR (cand.club_member_id IS NULL AND lower(cand.name) = lower(coalesce(vname,'')))) THEN
          RAISE EXCEPTION 'You cannot vote for yourself';
        END IF;
        INSERT INTO agm_ballot_votes(receipt_id, position_id, candidate_id) VALUES (r, p.id, cand.id);
      END LOOP;
    END IF;
  END LOOP;
  UPDATE agm_ballot_voters SET voted_at = now(), declared_at = now() WHERE id = v.id;
  RETURN code;
END $function$;

CREATE OR REPLACE FUNCTION public._agm_finalize_nominations(_ballot uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE b agm_ballots;
BEGIN
  SELECT * INTO b FROM agm_ballots WHERE id = _ballot FOR UPDATE;
  IF b.id IS NULL OR b.nominations_status <> 'open' OR b.nominations_close_at > now() OR b.status <> 'draft' THEN RETURN; END IF;
  DELETE FROM agm_ballot_candidates c USING agm_ballot_positions p WHERE c.position_id = p.id AND p.ballot_id = b.id;
  INSERT INTO agm_ballot_candidates (position_id, name, sort, club_member_id)
  SELECT n.position_id, cm.name, (row_number() OVER (PARTITION BY n.position_id ORDER BY cm.name))::int - 1, n.nominee_member_id
  FROM agm_nominations n JOIN club_members cm ON cm.id = n.nominee_member_id
  WHERE n.ballot_id = b.id AND n.status = 'accepted';
  UPDATE agm_ballots SET nominations_status = 'closed' WHERE id = b.id;
END $function$;