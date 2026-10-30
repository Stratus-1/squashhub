-- Test call-for-nominations links open a read-only preview of the nomination page.
CREATE OR REPLACE FUNCTION public.agm_nomination_for_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n agm_nominators; b agm_ballots; c clubs; me club_members; pv agm_preview_tokens;
BEGIN
  n := _agm_nominator(p_token);
  IF n.id IS NULL THEN
    SELECT * INTO pv FROM agm_preview_tokens WHERE token_hash = extensions.digest(coalesce(p_token,''), 'sha256') AND expires_at > now();
    IF pv.ballot_id IS NULL THEN RETURN jsonb_build_object('state','invalid'); END IF;
    SELECT * INTO b FROM agm_ballots WHERE id = pv.ballot_id;
    SELECT * INTO c FROM clubs WHERE id = b.club_id;
    SELECT * INTO me FROM club_members WHERE id = pv.club_member_id;
    RETURN jsonb_build_object('state','ok','preview',true,'club_name',c.name,'logo_url',c.logo_url,'title',b.title,'name',me.name,'member_id',me.id,
      'allow_self',b.allow_self_actions,'close_at',b.nominations_close_at,'closed',false,
      'positions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'max_choices',p.max_choices) ORDER BY p.sort),'[]') FROM agm_ballot_positions p WHERE p.ballot_id = b.id),
      'made','[]'::jsonb,'received','[]'::jsonb);
  END IF;
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
