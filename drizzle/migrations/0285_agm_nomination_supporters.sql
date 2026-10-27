CREATE TABLE public.agm_nomination_supporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomination_id uuid NOT NULL REFERENCES public.agm_nominations(id) ON DELETE CASCADE,
  ballot_id uuid NOT NULL REFERENCES public.agm_ballots(id) ON DELETE CASCADE,
  supporter_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nomination_id, supporter_member_id)
);
COMMENT ON TABLE public.agm_nomination_supporters IS 'Every member who nominated a person for a position, including the first nominator and later duplicate nominations. The nominee is asked to accept only once.';
GRANT SELECT ON public.agm_nomination_supporters TO authenticated;
GRANT ALL ON public.agm_nomination_supporters TO service_role;
ALTER TABLE public.agm_nomination_supporters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read nomination supporters" ON public.agm_nomination_supporters FOR SELECT TO authenticated USING (public._agm_ballot_admin(ballot_id, false));

INSERT INTO public.agm_nomination_supporters (nomination_id, ballot_id, supporter_member_id, created_at)
SELECT id, ballot_id, nominated_by, created_at FROM public.agm_nominations WHERE nominated_by IS NOT NULL
ON CONFLICT DO NOTHING;

DROP FUNCTION public.agm_nominate(text, uuid, uuid);
CREATE FUNCTION public.agm_nominate(p_token text, p_position_id uuid, p_nominee_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n agm_nominators; b agm_ballots; existing uuid; new_id uuid;
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
  SELECT id INTO existing FROM agm_nominations WHERE position_id = p_position_id AND nominee_member_id = p_nominee_id;
  IF existing IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM agm_nomination_supporters WHERE nomination_id = existing AND supporter_member_id = n.club_member_id) THEN
      RETURN 'already';
    END IF;
    INSERT INTO agm_nomination_supporters (nomination_id, ballot_id, supporter_member_id) VALUES (existing, b.id, n.club_member_id);
    RETURN 'supported';
  END IF;
  INSERT INTO agm_nominations (ballot_id, position_id, nominee_member_id, nominated_by, status, responded_at)
  VALUES (b.id, p_position_id, p_nominee_id, n.club_member_id,
    CASE WHEN p_nominee_id = n.club_member_id THEN 'accepted' ELSE 'pending' END,
    CASE WHEN p_nominee_id = n.club_member_id THEN now() END)
  RETURNING id INTO new_id;
  INSERT INTO agm_nomination_supporters (nomination_id, ballot_id, supporter_member_id) VALUES (new_id, b.id, n.club_member_id);
  RETURN 'created';
END $function$;
REVOKE ALL ON FUNCTION public.agm_nominate(text, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.agm_nominate(text, uuid, uuid) TO anon, authenticated, service_role;

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
  RETURN jsonb_build_object('state','ok','club_name',c.name,'logo_url',c.logo_url,'title',b.title,'name',me.name,'member_id',me.id,
    'allow_self', b.allow_self_actions,
    'close_at',b.nominations_close_at,'closed', b.nominations_status <> 'open' OR b.nominations_close_at <= now(),
    'positions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'max_choices',p.max_choices) ORDER BY p.sort),'[]') FROM agm_ballot_positions p WHERE p.ballot_id = b.id),
    'made',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'position_id',x.position_id,'nominee',cm.name,'status',x.status,
              'supporters',(SELECT count(*) FROM agm_nomination_supporters s2 WHERE s2.nomination_id = x.id)) ORDER BY s.created_at),'[]')
      FROM agm_nomination_supporters s JOIN agm_nominations x ON x.id = s.nomination_id JOIN club_members cm ON cm.id = x.nominee_member_id
      WHERE s.ballot_id = b.id AND s.supporter_member_id = me.id),
    'received',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'position_id',x.position_id,'self',x.nominated_by = me.id,'status',x.status,
              'by',(SELECT string_agg(cs.name, ', ' ORDER BY s.created_at) FROM agm_nomination_supporters s JOIN club_members cs ON cs.id = s.supporter_member_id WHERE s.nomination_id = x.id)) ORDER BY x.created_at),'[]')
      FROM agm_nominations x WHERE x.ballot_id = b.id AND x.nominee_member_id = me.id));
END $function$;