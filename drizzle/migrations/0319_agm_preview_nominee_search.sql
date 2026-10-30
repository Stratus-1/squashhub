CREATE OR REPLACE FUNCTION public.agm_search_nominees(p_token text, p_query text)
 RETURNS TABLE(club_member_id uuid, name text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n agm_nominators; allow_self boolean; pv agm_preview_tokens; q text;
BEGIN
  IF length(trim(coalesce(p_query,''))) < 2 THEN RETURN; END IF;
  q := '%' || replace(replace(trim(p_query),'%',''),'_','') || '%';
  n := _agm_nominator(p_token);
  IF n.id IS NULL THEN
    SELECT * INTO pv FROM agm_preview_tokens WHERE token_hash = extensions.digest(coalesce(p_token,''), 'sha256') AND expires_at > now();
    IF pv.ballot_id IS NULL THEN RETURN; END IF;
    SELECT b.allow_self_actions INTO allow_self FROM agm_ballots b WHERE b.id = pv.ballot_id;
    RETURN QUERY SELECT cm.id, cm.name FROM club_members cm JOIN agm_ballots b ON b.id = pv.ballot_id
      WHERE cm.club_id = b.club_id AND cm.status = 'active'
        AND coalesce(cm.suspension_status::text,'active') IN ('active','warning')
        AND cm.name ILIKE q AND (allow_self OR cm.id <> pv.club_member_id)
      ORDER BY cm.name LIMIT 10;
    RETURN;
  END IF;
  SELECT b.allow_self_actions INTO allow_self FROM agm_ballots b WHERE b.id = n.ballot_id;
  RETURN QUERY SELECT cm.id, cm.name FROM agm_nominators x JOIN club_members cm ON cm.id = x.club_member_id
    WHERE x.ballot_id = n.ballot_id AND cm.name ILIKE q
      AND (allow_self OR x.club_member_id <> n.club_member_id)
    ORDER BY cm.name LIMIT 10;
END $function$;