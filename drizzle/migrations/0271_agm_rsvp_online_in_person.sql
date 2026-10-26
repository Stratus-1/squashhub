ALTER TABLE public.agm_invitees DROP CONSTRAINT agm_invitees_rsvp_check;
ALTER TABLE public.agm_invitees ADD CONSTRAINT agm_invitees_rsvp_check CHECK (rsvp = ANY (ARRAY['attending','attending_in_person','attending_online','apologies']));
CREATE OR REPLACE FUNCTION public.agm_rsvp(p_token text, p_response text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE i agm_invitees; b agm_ballots;
BEGIN
  IF p_response NOT IN ('attending_in_person','attending_online','apologies') THEN RAISE EXCEPTION 'Invalid response'; END IF;
  SELECT * INTO i FROM agm_invitees WHERE token_hash = digest(coalesce(p_token,''),'sha256') FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = i.ballot_id;
  IF b.meeting_at IS NOT NULL AND b.meeting_at <= now() THEN RAISE EXCEPTION 'The meeting has already started'; END IF;
  UPDATE agm_invitees SET rsvp = p_response, rsvp_at = now() WHERE id = i.id;
END $function$;