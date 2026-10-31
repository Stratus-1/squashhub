CREATE OR REPLACE FUNCTION public.agm_add_nomination_recipients(p_ballot_id uuid, p_member_ids uuid[])
RETURNS TABLE(club_member_id uuid, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE b public.agm_ballots; mid uuid; t text;
BEGIN
 SELECT * INTO b FROM public.agm_ballots WHERE id=p_ballot_id FOR UPDATE;
 IF b.id IS NULL OR NOT public.is_club_admin(auth.uid(),b.club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF b.status <> 'draft' OR b.nominations_status <> 'open' OR b.nominations_close_at <= now() THEN RAISE EXCEPTION 'Nominations are not open'; END IF;
 FOREACH mid IN ARRAY coalesce(p_member_ids,'{}') LOOP
  IF NOT EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id=mid AND cm.club_id=b.club_id AND cm.status='active' AND cm.suspension_status IN ('active','warning')) THEN RAISE EXCEPTION 'Recipient is not an active member of this club'; END IF;
  IF EXISTS (SELECT 1 FROM public.agm_nominators n WHERE n.ballot_id=b.id AND n.club_member_id=mid) THEN CONTINUE; END IF;
  t := encode(gen_random_bytes(24),'hex');
  INSERT INTO public.agm_nominators(ballot_id,club_member_id,token_hash) VALUES(b.id,mid,digest(t,'sha256'));
  club_member_id:=mid; token:=t; RETURN NEXT;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.agm_add_nomination_recipients(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agm_add_nomination_recipients(uuid,uuid[]) TO authenticated,service_role;