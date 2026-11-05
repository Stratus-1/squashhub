CREATE TABLE IF NOT EXISTS public.agm_nominator_old_tokens (
  token_hash bytea PRIMARY KEY,
  nominator_id uuid NOT NULL REFERENCES public.agm_nominators(id) ON DELETE CASCADE,
  replaced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agm_nominator_old_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agm_nominator_old_tokens FROM anon, authenticated;
GRANT ALL ON public.agm_nominator_old_tokens TO service_role;

CREATE OR REPLACE FUNCTION public._agm_nominator(_token text)
RETURNS agm_nominators LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT n.* FROM agm_nominators n
  WHERE n.token_hash = digest(coalesce(_token,''),'sha256')
     OR n.id = (SELECT o.nominator_id FROM agm_nominator_old_tokens o WHERE o.token_hash = digest(coalesce(_token,''),'sha256'))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.agm_reissue_nomination_token(p_ballot_id uuid, p_member_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE t text; n agm_nominators;
BEGIN
  IF NOT _agm_ballot_admin(p_ballot_id, false) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO n FROM agm_nominators WHERE ballot_id = p_ballot_id AND club_member_id = p_member_id FOR UPDATE;
  IF n.id IS NULL THEN RAISE EXCEPTION 'Member is not on the nomination list'; END IF;
  INSERT INTO agm_nominator_old_tokens(token_hash, nominator_id) VALUES (n.token_hash, n.id) ON CONFLICT DO NOTHING;
  t := encode(gen_random_bytes(24), 'hex');
  UPDATE agm_nominators SET token_hash = digest(t,'sha256') WHERE id = n.id;
  RETURN t;
END $$;