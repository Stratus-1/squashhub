ALTER TABLE public.agm_ballots
  ADD COLUMN IF NOT EXISTS meeting_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_venue text,
  ADD COLUMN IF NOT EXISTS meeting_details text,
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE public.agm_invitees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id uuid NOT NULL REFERENCES public.agm_ballots(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  rsvp text CHECK (rsvp IN ('attending','apologies')),
  rsvp_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ballot_id, club_member_id)
);
GRANT SELECT ON public.agm_invitees TO authenticated;
GRANT ALL ON public.agm_invitees TO service_role;
ALTER TABLE public.agm_invitees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read invitees" ON public.agm_invitees FOR SELECT TO authenticated
  USING (_agm_ballot_admin(ballot_id, false));

CREATE OR REPLACE FUNCTION public.agm_update_meeting(p_ballot_id uuid, p_meeting_at timestamptz, p_venue text, p_details text, p_documents jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b agm_ballots;
BEGIN
  SELECT * INTO b FROM agm_ballots WHERE id = p_ballot_id;
  IF b.id IS NULL OR NOT is_club_admin(auth.uid(), b.club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF jsonb_typeof(coalesce(p_documents,'[]')) <> 'array' THEN RAISE EXCEPTION 'Invalid documents'; END IF;
  UPDATE agm_ballots SET meeting_at = p_meeting_at, meeting_venue = nullif(trim(p_venue),''),
    meeting_details = nullif(trim(p_details),''), documents = coalesce(p_documents,'[]') WHERE id = b.id;
END $$;

CREATE OR REPLACE FUNCTION public.agm_issue_invites(p_ballot_id uuid, p_member_ids uuid[])
RETURNS TABLE(club_member_id uuid, token text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE b agm_ballots; mid uuid; t text;
BEGIN
  SELECT * INTO b FROM agm_ballots WHERE id = p_ballot_id;
  IF b.id IS NULL OR NOT is_club_admin(auth.uid(), b.club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  FOREACH mid IN ARRAY coalesce(p_member_ids,'{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM club_members cm WHERE cm.id = mid AND cm.club_id = b.club_id AND cm.status = 'active') THEN
      RAISE EXCEPTION 'Member % is not an active member of this club', mid;
    END IF;
    t := encode(gen_random_bytes(24), 'hex');
    INSERT INTO agm_invitees AS x (ballot_id, club_member_id, token_hash) VALUES (b.id, mid, digest(t,'sha256'))
      ON CONFLICT (ballot_id, club_member_id) DO UPDATE SET token_hash = EXCLUDED.token_hash;
    club_member_id := mid; token := t; RETURN NEXT;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.agm_invite_for_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE i agm_invitees; b agm_ballots; cm club_members; c clubs;
BEGIN
  SELECT * INTO i FROM agm_invitees WHERE token_hash = digest(coalesce(p_token,''),'sha256');
  IF i.id IS NULL THEN RETURN jsonb_build_object('state','invalid'); END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = i.ballot_id;
  SELECT * INTO cm FROM club_members WHERE id = i.club_member_id;
  SELECT * INTO c FROM clubs WHERE id = b.club_id;
  RETURN jsonb_build_object('state','ok','title',b.title,'club_name',c.name,'name',cm.name,
    'meeting_at',b.meeting_at,'venue',b.meeting_venue,'details',b.meeting_details,'documents',b.documents,
    'vote_deadline',b.deadline,'rsvp',i.rsvp,
    'locked', b.meeting_at IS NOT NULL AND b.meeting_at <= now());
END $$;

CREATE OR REPLACE FUNCTION public.agm_rsvp(p_token text, p_response text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE i agm_invitees; b agm_ballots;
BEGIN
  IF p_response NOT IN ('attending','apologies') THEN RAISE EXCEPTION 'Invalid response'; END IF;
  SELECT * INTO i FROM agm_invitees WHERE token_hash = digest(coalesce(p_token,''),'sha256') FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = i.ballot_id;
  IF b.meeting_at IS NOT NULL AND b.meeting_at <= now() THEN RAISE EXCEPTION 'The meeting has already started'; END IF;
  UPDATE agm_invitees SET rsvp = p_response, rsvp_at = now() WHERE id = i.id;
END $$;

REVOKE ALL ON FUNCTION public.agm_update_meeting(uuid,timestamptz,text,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agm_issue_invites(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agm_update_meeting(uuid,timestamptz,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agm_issue_invites(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agm_invite_for_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agm_rsvp(text,text) TO anon, authenticated;

CREATE POLICY "Club admins upload AGM documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agm-documents' AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Club admins delete AGM documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agm-documents' AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Attached AGM documents are readable" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'agm-documents' AND EXISTS (
    SELECT 1 FROM public.agm_ballots b WHERE b.documents @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))));