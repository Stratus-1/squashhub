ALTER TABLE public.agm_ballots ADD COLUMN runoff_parent_id uuid REFERENCES public.agm_ballots(id);
CREATE UNIQUE INDEX agm_one_runoff_per_ballot ON public.agm_ballots(runoff_parent_id) WHERE runoff_parent_id IS NOT NULL;
COMMENT ON COLUMN public.agm_ballots.runoff_parent_id IS 'Second ballot for tied remaining seats; the parent results and receipts remain unchanged.';

CREATE OR REPLACE FUNCTION public._agm_effective_voter(p_token text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v agm_ballot_voters; child uuid; next_v uuid;
BEGIN
 SELECT * INTO v FROM agm_ballot_voters WHERE token_hash=digest(coalesce(p_token,''),'sha256');
 IF v.id IS NULL THEN RETURN NULL; END IF;
 LOOP
  SELECT id INTO child FROM agm_ballots WHERE runoff_parent_id=v.ballot_id AND status='open';
  IF child IS NULL THEN RETURN v.id; END IF;
  SELECT id INTO next_v FROM agm_ballot_voters WHERE ballot_id=child AND club_member_id=v.club_member_id;
  IF next_v IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v FROM agm_ballot_voters WHERE id=next_v;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._agm_effective_voter(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.agm_open_runoff(p_ballot_id uuid,p_deadline timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE b agm_ballots; child uuid; pos record; cutoff bigint; above_count integer; tied_count integer; remaining integer; new_pos uuid; added integer:=0;
BEGIN
 SELECT * INTO b FROM agm_ballots WHERE id=p_ballot_id FOR UPDATE;
 IF b.id IS NULL OR NOT public._agm_ballot_admin(b.id,false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF b.status<>'open' OR b.deadline>now() THEN RAISE EXCEPTION 'Wait until voting closes before opening a run-off'; END IF;
 IF p_deadline IS NULL OR p_deadline<=now() THEN RAISE EXCEPTION 'Run-off deadline must be in the future'; END IF;
 SELECT id INTO child FROM agm_ballots WHERE runoff_parent_id=b.id;
 IF child IS NOT NULL THEN RETURN child; END IF;
 INSERT INTO agm_ballots(club_id,title,declaration,deadline,status,opened_at,eligible_count,created_by,runoff_parent_id,allow_self_actions,allow_self_vote,meeting_at,meeting_venue,meeting_details,documents)
 VALUES(b.club_id,b.title||' — run-off',b.declaration,p_deadline,'open',now(),b.eligible_count,auth.uid(),b.id,b.allow_self_actions,b.allow_self_vote,b.meeting_at,b.meeting_venue,b.meeting_details,b.documents) RETURNING id INTO child;
 FOR pos IN SELECT * FROM agm_ballot_positions WHERE ballot_id=b.id ORDER BY sort LOOP
  WITH tally AS (SELECT c.id,count(v.candidate_id) AS votes FROM agm_ballot_candidates c LEFT JOIN agm_ballot_votes v ON v.candidate_id=c.id WHERE c.position_id=pos.id GROUP BY c.id)
  SELECT votes INTO cutoff FROM tally WHERE votes>0 ORDER BY votes DESC OFFSET (pos.max_choices-1) LIMIT 1;
  IF cutoff IS NULL THEN CONTINUE; END IF;
  WITH tally AS (SELECT c.id,count(v.candidate_id) AS votes FROM agm_ballot_candidates c LEFT JOIN agm_ballot_votes v ON v.candidate_id=c.id WHERE c.position_id=pos.id GROUP BY c.id)
  SELECT count(*) FILTER(WHERE votes>cutoff),count(*) FILTER(WHERE votes=cutoff) INTO above_count,tied_count FROM tally;
  remaining:=pos.max_choices-above_count;
  IF tied_count<=remaining THEN CONTINUE; END IF;
  INSERT INTO agm_ballot_positions(ballot_id,title,sort,max_choices) VALUES(child,pos.title,pos.sort,remaining) RETURNING id INTO new_pos;
  INSERT INTO agm_ballot_candidates(position_id,name,sort,club_member_id)
  SELECT new_pos,c.name,c.sort,c.club_member_id FROM agm_ballot_candidates c WHERE c.position_id=pos.id AND (SELECT count(*) FROM agm_ballot_votes v WHERE v.candidate_id=c.id)=cutoff;
  added:=added+1;
 END LOOP;
 IF added=0 THEN RAISE EXCEPTION 'No tied seats require a run-off'; END IF;
 INSERT INTO agm_ballot_voters(ballot_id,club_member_id,token_hash)
 SELECT child,club_member_id,digest(gen_random_bytes(32),'sha256') FROM agm_ballot_voters WHERE ballot_id=b.id;
 RETURN child;
END $$;
REVOKE ALL ON FUNCTION public.agm_open_runoff(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agm_open_runoff(uuid,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.agm_ballot_for_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v agm_ballot_voters; b agm_ballots; cm club_members; c clubs; pv agm_preview_tokens;
BEGIN
 SELECT * INTO v FROM agm_ballot_voters WHERE id=public._agm_effective_voter(p_token);
 IF v.id IS NULL THEN
  SELECT * INTO pv FROM agm_preview_tokens WHERE token_hash=digest(coalesce(p_token,''),'sha256') AND expires_at>now();
  IF pv.ballot_id IS NULL THEN RETURN jsonb_build_object('state','invalid'); END IF;
  SELECT * INTO b FROM agm_ballots WHERE id=pv.ballot_id;
  SELECT * INTO cm FROM club_members WHERE id=pv.club_member_id;
  SELECT * INTO c FROM clubs WHERE id=b.club_id;
  RETURN jsonb_build_object('state','open','preview',true,'ballot_id',b.id,'title',b.title,'declaration',b.declaration,'deadline',b.deadline,'club_name',c.name,
   'voter',jsonb_build_object('name',cm.name,'member_number',cm.club_member_number,'email',cm.email),
   'positions',CASE WHEN b.allow_self_vote THEN _agm_positions_json(b.id) ELSE _agm_positions_json_excl(b.id,pv.club_member_id,cm.name) END);
 END IF;
 SELECT * INTO b FROM agm_ballots WHERE id=v.ballot_id;
 SELECT * INTO cm FROM club_members WHERE id=v.club_member_id;
 SELECT * INTO c FROM clubs WHERE id=b.club_id;
 RETURN jsonb_build_object('state',CASE WHEN v.voted_at IS NOT NULL THEN 'voted' WHEN b.status<>'open' OR b.deadline<=now() THEN 'closed' ELSE 'open' END,
  'ballot_id',b.id,'runoff',b.runoff_parent_id IS NOT NULL,'title',b.title,'declaration',b.declaration,'deadline',b.deadline,'club_name',c.name,
  'voter',jsonb_build_object('name',cm.name,'member_number',cm.club_member_number,'email',cm.email),
  'positions',CASE WHEN v.voted_at IS NULL AND b.status='open' AND b.deadline>now() THEN CASE WHEN b.allow_self_vote THEN _agm_positions_json(b.id) ELSE _agm_positions_json_excl(b.id,v.club_member_id,cm.name) END ELSE '[]'::jsonb END);
END $$;

CREATE OR REPLACE FUNCTION public.agm_cast_vote(p_token text,p_declared boolean,p_choices jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v agm_ballot_voters; b agm_ballots; r uuid; code text; p record; cand record; val jsonb; picks text[]; raw text; vname text;
BEGIN
 SELECT * INTO v FROM agm_ballot_voters WHERE id=public._agm_effective_voter(p_token) FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'This voting link is not valid'; END IF;
 IF v.voted_at IS NOT NULL THEN RAISE EXCEPTION 'You have already voted'; END IF;
 SELECT * INTO b FROM agm_ballots WHERE id=v.ballot_id;
 IF b.status<>'open' OR b.deadline<=now() THEN RAISE EXCEPTION 'Voting has closed'; END IF;
 IF NOT coalesce(p_declared,false) THEN RAISE EXCEPTION 'Please confirm the membership declaration'; END IF;
 IF p_choices IS NULL OR jsonb_typeof(p_choices)<>'object' THEN RAISE EXCEPTION 'Invalid ballot'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_choices) k WHERE NOT EXISTS(SELECT 1 FROM agm_ballot_positions pp WHERE pp.ballot_id=b.id AND pp.id::text=k)) OR EXISTS(SELECT 1 FROM agm_ballot_positions pp WHERE pp.ballot_id=b.id AND NOT(p_choices ? pp.id::text)) THEN RAISE EXCEPTION 'The ballot has changed. Refresh your voting link before submitting'; END IF;
 SELECT name INTO vname FROM club_members WHERE id=v.club_member_id;
 code:=upper(substr(encode(gen_random_bytes(6),'hex'),1,4)||'-'||substr(encode(gen_random_bytes(6),'hex'),1,4));
 INSERT INTO agm_ballot_receipts(ballot_id,receipt_code) VALUES(b.id,code) RETURNING id INTO r;
 FOR p IN SELECT id,title,max_choices FROM agm_ballot_positions WHERE ballot_id=b.id LOOP
  val:=p_choices->p.id::text;
  IF val IS NULL OR jsonb_typeof(val)='null' THEN picks:=ARRAY[]::text[];
  ELSIF jsonb_typeof(val)='string' THEN picks:=CASE WHEN val#>>'{}'='' THEN ARRAY[]::text[] ELSE ARRAY[val#>>'{}'] END;
  ELSIF jsonb_typeof(val)='array' THEN SELECT coalesce(array_agg(e),ARRAY[]::text[]) INTO picks FROM jsonb_array_elements_text(val) e;
  ELSE RAISE EXCEPTION 'Invalid ballot'; END IF;
  IF cardinality(picks)>p.max_choices THEN RAISE EXCEPTION 'Too many choices for %',p.title; END IF;
  IF cardinality(picks)<>(SELECT count(DISTINCT x) FROM unnest(picks) x) THEN RAISE EXCEPTION 'Duplicate choice for %',p.title; END IF;
  IF cardinality(picks)=0 THEN INSERT INTO agm_ballot_votes(receipt_id,position_id,candidate_id) VALUES(r,p.id,NULL);
  ELSE
   FOREACH raw IN ARRAY picks LOOP
    SELECT x.id,x.name,x.club_member_id INTO cand FROM agm_ballot_candidates x WHERE x.position_id=p.id AND x.id::text=raw;
    IF cand.id IS NULL THEN RAISE EXCEPTION 'Invalid choice on ballot'; END IF;
    IF NOT b.allow_self_vote AND (cand.club_member_id=v.club_member_id OR (cand.club_member_id IS NULL AND lower(cand.name)=lower(coalesce(vname,'')))) THEN RAISE EXCEPTION 'You cannot vote for yourself'; END IF;
    INSERT INTO agm_ballot_votes(receipt_id,position_id,candidate_id) VALUES(r,p.id,cand.id);
   END LOOP;
  END IF;
 END LOOP;
 UPDATE agm_ballot_voters SET voted_at=now(),declared_at=now() WHERE id=v.id;
 RETURN code;
END $$;