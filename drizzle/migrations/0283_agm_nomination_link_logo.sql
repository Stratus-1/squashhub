-- Show the club's own logo on the nomination link page.
-- The link page is opened straight from an email, so the club name and logo
-- must come from the ballot's club rather than the app's club context.
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
    'made',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'position_id',x.position_id,'nominee',cm.name,'status',x.status) ORDER BY x.created_at),'[]')
      FROM agm_nominations x JOIN club_members cm ON cm.id = x.nominee_member_id WHERE x.ballot_id = b.id AND x.nominated_by = me.id),
    'received',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'position_id',x.position_id,'by',cm.name,'self',x.nominated_by = me.id,'status',x.status) ORDER BY x.created_at),'[]')
      FROM agm_nominations x JOIN club_members cm ON cm.id = x.nominated_by WHERE x.ballot_id = b.id AND x.nominee_member_id = me.id));
END $function$;