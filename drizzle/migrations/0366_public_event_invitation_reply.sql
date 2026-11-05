CREATE TABLE public.event_invitation_links (token_hash text PRIMARY KEY, club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE, event_id uuid NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE, instance_id uuid REFERENCES public.club_event_instances(id) ON DELETE CASCADE, club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.event_invitation_links TO service_role;
ALTER TABLE public.event_invitation_links ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.issue_event_invitation_link(p_event_id uuid,p_instance_id uuid,p_club_member_id uuid,p_club_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.club_events%ROWTYPE; i public.club_event_instances%ROWTYPE; t text; sub text; expiry timestamptz;
BEGIN
SELECT * INTO e FROM public.club_events WHERE id=p_event_id AND club_id=p_club_id AND status='active';
IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.club_members WHERE id=p_club_member_id AND club_id=p_club_id) THEN RAISE EXCEPTION 'Invitation unavailable'; END IF;
IF p_instance_id IS NULL THEN SELECT * INTO i FROM public.club_event_instances WHERE event_id=e.id AND status='scheduled' AND (instance_date+e.start_time) AT TIME ZONE 'Africa/Johannesburg'>now() ORDER BY instance_date LIMIT 1;
ELSE SELECT * INTO i FROM public.club_event_instances WHERE id=p_instance_id AND event_id=e.id AND status='scheduled'; END IF;
IF i.id IS NOT NULL THEN
IF NOT EXISTS(SELECT 1 FROM public.club_event_instance_rsvps WHERE instance_id=i.id AND club_member_id=p_club_member_id AND status IN ('invited','confirmed','declined')) THEN RAISE EXCEPTION 'Invitation unavailable'; END IF;
expiry := (i.instance_date+e.start_time) AT TIME ZONE 'Africa/Johannesburg';
ELSE
IF p_instance_id IS NOT NULL OR e.recurrence<>'once' OR NOT EXISTS(SELECT 1 FROM public.club_event_rsvps WHERE event_id=e.id AND club_member_id=p_club_member_id AND status IN ('invited','confirmed','declined')) THEN RAISE EXCEPTION 'Invitation unavailable'; END IF;
expiry := (e.start_date+e.start_time) AT TIME ZONE 'Africa/Johannesburg'; END IF;
IF expiry<=now() THEN RAISE EXCEPTION 'Invitation closed'; END IF;
SELECT subdomain INTO sub FROM public.clubs WHERE id=e.club_id;
t := encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
INSERT INTO public.event_invitation_links(token_hash,club_id,event_id,instance_id,club_member_id,expires_at) VALUES(encode(sha256(convert_to(t,'UTF8')),'hex'),e.club_id,e.id,i.id,p_club_member_id,expiry);
RETURN jsonb_build_object('token',t,'subdomain',sub);
END; $$;
REVOKE ALL ON FUNCTION public.issue_event_invitation_link(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_event_invitation_link(uuid,uuid,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.event_invitation_reply(p_token text,p_subdomain text DEFAULT NULL,p_response text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.event_invitation_links%ROWTYPE; e public.club_events%ROWTYPE; i public.club_event_instances%ROWTYPE; c public.clubs%ROWTYPE; s text; closed boolean; event_date date; starts_at timestamptz;
BEGIN
IF p_token IS NULL OR p_token!~'^[a-f0-9]{64}$' OR (p_response IS NOT NULL AND p_response NOT IN ('confirmed','declined')) THEN RETURN jsonb_build_object('state','invalid'); END IF;
SELECT * INTO l FROM public.event_invitation_links WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') FOR UPDATE;
IF NOT FOUND THEN RETURN jsonb_build_object('state','invalid'); END IF;
SELECT * INTO e FROM public.club_events WHERE id=l.event_id AND club_id=l.club_id;
IF NOT FOUND THEN RETURN jsonb_build_object('state','invalid'); END IF;
SELECT * INTO c FROM public.clubs WHERE id=l.club_id;
IF p_subdomain IS NOT NULL AND p_subdomain IS DISTINCT FROM c.subdomain THEN RETURN jsonb_build_object('state','invalid'); END IF;
IF NOT EXISTS(SELECT 1 FROM public.club_members WHERE id=l.club_member_id AND club_id=l.club_id) THEN RETURN jsonb_build_object('state','invalid'); END IF;
IF l.instance_id IS NOT NULL THEN
SELECT * INTO i FROM public.club_event_instances WHERE id=l.instance_id AND event_id=e.id FOR UPDATE;
IF NOT FOUND THEN RETURN jsonb_build_object('state','invalid'); END IF;
SELECT status INTO s FROM public.club_event_instance_rsvps WHERE instance_id=i.id AND club_member_id=l.club_member_id FOR UPDATE;
event_date := i.instance_date;
ELSE
IF e.recurrence<>'once' THEN RETURN jsonb_build_object('state','invalid'); END IF;
SELECT status INTO s FROM public.club_event_rsvps WHERE event_id=e.id AND club_member_id=l.club_member_id FOR UPDATE;
event_date := e.start_date; END IF;
IF s IS NULL OR s NOT IN ('invited','confirmed','declined') THEN RETURN jsonb_build_object('state','invalid'); END IF;
starts_at := (event_date+e.start_time) AT TIME ZONE 'Africa/Johannesburg';
closed := l.expires_at<=now() OR starts_at<=now() OR e.status<>'active' OR (i.id IS NOT NULL AND i.status<>'scheduled');
IF p_response IS NOT NULL AND NOT closed THEN
IF l.instance_id IS NOT NULL THEN UPDATE public.club_event_instance_rsvps SET status=p_response,updated_at=now() WHERE instance_id=l.instance_id AND club_member_id=l.club_member_id;
ELSE UPDATE public.club_event_rsvps SET status=p_response,updated_at=now() WHERE event_id=l.event_id AND club_member_id=l.club_member_id; END IF;
s := p_response; END IF;
RETURN jsonb_build_object('state','ok','club_name',c.name,'title',e.title,'description',e.description,'instance_date',event_date,'start_time',e.start_time,'status',s,'locked',closed);
END; $$;
REVOKE ALL ON FUNCTION public.event_invitation_reply(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_invitation_reply(text,text,text) TO anon,authenticated,service_role;