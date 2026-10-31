CREATE TABLE public.comms_email_attempts (
 campaign_id uuid NOT NULL REFERENCES public.comms_campaigns(id) ON DELETE CASCADE,
 club_id uuid NOT NULL REFERENCES public.clubs(id),
 club_member_id uuid NOT NULL REFERENCES public.club_members(id),
 attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (campaign_id, club_member_id)
);
GRANT ALL ON public.comms_email_attempts TO service_role;
ALTER TABLE public.comms_email_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX comms_email_attempts_club_time ON public.comms_email_attempts(club_id, attempted_at);
CREATE OR REPLACE FUNCTION public.reserve_nomination_email(_campaign_id uuid, _member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.comms_campaigns; t timestamptz; oldest timestamptz; used integer;
BEGIN
 SELECT * INTO STRICT c FROM public.comms_campaigns WHERE id = _campaign_id;
 IF c.club_id <> 'e41098d4-9b19-4fc0-a082-d43ac13ff32b'::uuid OR c.audience_filter->>'purpose' IS DISTINCT FROM 'agm_nominations' THEN
 RAISE EXCEPTION 'Campaign is outside nomination quota scope'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.club_members WHERE id = _member_id AND club_id = c.club_id) THEN
 RAISE EXCEPTION 'Recipient is outside this club'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nomination-email:' || c.club_id::text, 0));
 t := clock_timestamp();
 IF EXISTS (SELECT 1 FROM public.comms_email_attempts WHERE campaign_id = _campaign_id AND club_member_id = _member_id) THEN
 RETURN jsonb_build_object('allowed', false, 'already_attempted', true); END IF;
 SELECT count(*), min(attempted_at) INTO used, oldest FROM public.comms_email_attempts
 WHERE club_id = c.club_id AND attempted_at > t - interval '1 hour';
 IF used >= 30 THEN RETURN jsonb_build_object('allowed', false, 'retry_at', oldest + interval '1 hour'); END IF;
 INSERT INTO public.comms_email_attempts(campaign_id, club_id, club_member_id, attempted_at) VALUES (_campaign_id, c.club_id, _member_id, t);
 RETURN jsonb_build_object('allowed', true);
END; $$;
REVOKE ALL ON FUNCTION public.reserve_nomination_email(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_nomination_email(uuid, uuid) TO service_role;