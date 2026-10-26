CREATE OR REPLACE FUNCTION public.agm_issue_invites(p_ballot_id uuid, p_member_ids uuid[])
 RETURNS TABLE(club_member_id uuid, token text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
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
      ON CONFLICT ON CONSTRAINT agm_invitees_ballot_id_club_member_id_key DO UPDATE SET token_hash = EXCLUDED.token_hash;
    club_member_id := mid; token := t; RETURN NEXT;
  END LOOP;
END $function$;