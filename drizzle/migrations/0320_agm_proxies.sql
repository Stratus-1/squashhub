CREATE TABLE public.agm_proxies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id uuid NOT NULL REFERENCES public.agm_ballots(id) ON DELETE CASCADE,
  grantor_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  proxy_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (ballot_id, grantor_member_id),
  CHECK (grantor_member_id <> proxy_member_id)
);
REVOKE ALL ON public.agm_proxies FROM anon, authenticated;
GRANT ALL ON public.agm_proxies TO service_role;
ALTER TABLE public.agm_proxies ENABLE ROW LEVEL SECURITY;

-- Accepted proxies are disclosed by name to every invitee and the admins.
CREATE OR REPLACE FUNCTION public._agm_proxy_list(_ballot uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'grantor',g.name,'proxy',h.name,'status',p.status) ORDER BY h.name, g.name), '[]'::jsonb)
  FROM agm_proxies p JOIN club_members g ON g.id = p.grantor_member_id JOIN club_members h ON h.id = p.proxy_member_id
  WHERE p.ballot_id = _ballot
$$;
REVOKE ALL ON FUNCTION public._agm_proxy_list(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agm_invite_for_token(p_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE i agm_invitees; b agm_ballots; cm club_members; c clubs; pv agm_preview_tokens; mid uuid; bid uuid;
  mine jsonb; recv jsonb; allp jsonb;
BEGIN
  SELECT * INTO i FROM agm_invitees WHERE token_hash = digest(coalesce(p_token,''),'sha256');
  IF i.id IS NULL THEN
    SELECT * INTO pv FROM agm_preview_tokens WHERE token_hash = digest(coalesce(p_token,''), 'sha256') AND expires_at > now();
    IF pv.ballot_id IS NULL THEN RETURN jsonb_build_object('state','invalid'); END IF;
    bid := pv.ballot_id; mid := pv.club_member_id;
  ELSE bid := i.ballot_id; mid := i.club_member_id; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = bid;
  SELECT * INTO cm FROM club_members WHERE id = mid;
  SELECT * INTO c FROM clubs WHERE id = b.club_id;
  IF i.id IS NOT NULL THEN
    SELECT jsonb_build_object('id',p.id,'name',h.name,'status',p.status) INTO mine
      FROM agm_proxies p JOIN club_members h ON h.id = p.proxy_member_id
      WHERE p.ballot_id = bid AND p.grantor_member_id = mid;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',g.name,'status',p.status) ORDER BY g.name),'[]'::jsonb) INTO recv
      FROM agm_proxies p JOIN club_members g ON g.id = p.grantor_member_id
      WHERE p.ballot_id = bid AND p.proxy_member_id = mid AND p.status <> 'declined';
  END IF;
  SELECT coalesce(jsonb_agg(x) FILTER (WHERE x->>'status' = 'accepted'), '[]'::jsonb) INTO allp
    FROM jsonb_array_elements(public._agm_proxy_list(bid)) x;
  RETURN jsonb_build_object('state','ok','preview', i.id IS NULL,'title',b.title,'club_name',c.name,'name',cm.name,
    'meeting_at',b.meeting_at,'venue',b.meeting_venue,'details',b.meeting_details,'documents',b.documents,
    'vote_deadline',b.deadline,'rsvp',i.rsvp,
    'my_proxy', mine, 'proxies_received', coalesce(recv,'[]'::jsonb), 'accepted_proxies', allp,
    'locked', i.id IS NULL OR (b.meeting_at IS NOT NULL AND b.meeting_at <= now()));
END $function$;

-- Search fellow invitees of the same meeting (eligible members only), never yourself.
CREATE OR REPLACE FUNCTION public.agm_proxy_search(p_token text, p_query text)
 RETURNS TABLE(club_member_id uuid, name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE i agm_invitees;
BEGIN
  SELECT * INTO i FROM agm_invitees WHERE token_hash = digest(coalesce(p_token,''),'sha256');
  IF i.id IS NULL OR length(trim(coalesce(p_query,''))) < 2 THEN RETURN; END IF;
  RETURN QUERY SELECT m.id, m.name FROM agm_invitees o JOIN club_members m ON m.id = o.club_member_id
    WHERE o.ballot_id = i.ballot_id AND o.club_member_id <> i.club_member_id
      AND m.name ILIKE '%' || trim(p_query) || '%'
    ORDER BY m.name LIMIT 15;
END $function$;

-- Appoint (or withdraw with NULL) a proxy. Changing the person resets acceptance.
CREATE OR REPLACE FUNCTION public.agm_appoint_proxy(p_token text, p_proxy_member_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE i agm_invitees; b agm_ballots;
BEGIN
  SELECT * INTO i FROM agm_invitees WHERE token_hash = digest(coalesce(p_token,''),'sha256');
  IF i.id IS NULL THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = i.ballot_id;
  IF b.meeting_at IS NOT NULL AND b.meeting_at <= now() THEN RAISE EXCEPTION 'The meeting has already started'; END IF;
  IF p_proxy_member_id IS NULL THEN
    DELETE FROM agm_proxies WHERE ballot_id = i.ballot_id AND grantor_member_id = i.club_member_id; RETURN;
  END IF;
  IF p_proxy_member_id = i.club_member_id THEN RAISE EXCEPTION 'You cannot appoint yourself'; END IF;
  IF NOT EXISTS (SELECT 1 FROM agm_invitees WHERE ballot_id = i.ballot_id AND club_member_id = p_proxy_member_id) THEN
    RAISE EXCEPTION 'That person is not invited to this meeting';
  END IF;
  INSERT INTO agm_proxies (ballot_id, grantor_member_id, proxy_member_id)
  VALUES (i.ballot_id, i.club_member_id, p_proxy_member_id)
  ON CONFLICT (ballot_id, grantor_member_id) DO UPDATE
    SET proxy_member_id = EXCLUDED.proxy_member_id, status = 'pending', responded_at = NULL, created_at = now()
    WHERE agm_proxies.proxy_member_id <> EXCLUDED.proxy_member_id;
END $function$;

CREATE OR REPLACE FUNCTION public.agm_respond_proxy(p_token text, p_proxy_id uuid, p_accept boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE i agm_invitees; b agm_ballots;
BEGIN
  SELECT * INTO i FROM agm_invitees WHERE token_hash = digest(coalesce(p_token,''),'sha256');
  IF i.id IS NULL THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = i.ballot_id;
  IF b.meeting_at IS NOT NULL AND b.meeting_at <= now() THEN RAISE EXCEPTION 'The meeting has already started'; END IF;
  UPDATE agm_proxies SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, responded_at = now()
    WHERE id = p_proxy_id AND ballot_id = i.ballot_id AND proxy_member_id = i.club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proxy request not found'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.agm_proxy_summary(p_ballot_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._agm_ballot_admin(p_ballot_id, false) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN public._agm_proxy_list(p_ballot_id);
END $function$;

REVOKE ALL ON FUNCTION public.agm_proxy_search(text,text), public.agm_appoint_proxy(text,uuid),
  public.agm_respond_proxy(text,uuid,boolean), public.agm_proxy_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agm_proxy_search(text,text), public.agm_appoint_proxy(text,uuid),
  public.agm_respond_proxy(text,uuid,boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agm_proxy_summary(uuid) TO authenticated;