DO $fix$
DECLARE
 d text := pg_get_functiondef('public.enforce_booking_credit_allowance()'::regprocedure);
 anchor text := ' IF NOT v_courts_admin AND (NEW.user_id IS DISTINCT FROM v_actor';
BEGIN
 IF position('Fixture-bound tournament booking authority' in d)>0 THEN RETURN; END IF;
 IF position(anchor in d)=0 THEN RAISE EXCEPTION 'Unexpected booking ownership guard; refusing replacement'; END IF;
 d:=replace(d,anchor,$patch$
 -- Fixture-bound tournament booking authority; never trust a client flag.
 IF NOT v_courts_admin THEN
  SELECT EXISTS (
   SELECT 1 FROM public.club_champs_matches m
   JOIN public.club_champs c ON c.id=m.champ_id
   WHERE NEW.source='club_event'
    AND NEW.external_id='champ:'||m.champ_id::text||':match:'||m.id::text
    AND NEW.club_member_id=m.player_a_member_id
    AND NEW.opponent_member_id=m.player_b_member_id
    AND NEW.user_id IS NOT DISTINCT FROM (SELECT cm.user_id FROM public.club_members cm WHERE cm.id=m.player_a_member_id)
    AND c.club_id=v_club
    AND NOT coalesce(m.is_bye,false)
    AND m.status NOT IN ('completed','forfeited','walkover','cancelled')
    AND (public.is_member_owner(m.player_a_member_id) OR public.is_member_owner(m.player_b_member_id)
      OR public.is_member_owner(m.partner_a_member_id) OR public.is_member_owner(m.partner_b_member_id)
      OR public.is_club_admin_or_permitted(v_actor,c.club_id,'champs'))
  ) INTO v_courts_admin;
 END IF;
 -- Restoring a released ownerless reservation is not a personal booking.
 IF TG_OP='UPDATE' AND OLD.status='cancelled' AND NEW.status='active'
  AND NEW.user_id IS NULL AND NEW.club_member_id IS NULL
  AND NEW.opponent_id IS NULL AND NEW.opponent_member_id IS NULL
  AND btrim(coalesce(OLD.external_booker_name,'')) ILIKE 'club championship%'
  AND (to_jsonb(NEW)-'status'-'ops_note')=(to_jsonb(OLD)-'status'-'ops_note')
  AND EXISTS (
   SELECT 1 FROM public.club_champs_matches m JOIN public.club_champs c ON c.id=m.champ_id
   JOIN public.bookings b ON b.id=m.booking_id
   WHERE c.club_id=v_club AND b.club_id=v_club AND b.status='active'
    AND OLD.ops_note LIKE '%Released for tournament match '||m.id::text||'%'
    AND NOT (b.court_id=NEW.court_id AND b.date=NEW.date AND b.start_time<NEW.end_time AND b.end_time>NEW.start_time)
    AND (public.is_member_owner(m.player_a_member_id) OR public.is_member_owner(m.player_b_member_id)
      OR public.is_member_owner(m.partner_a_member_id) OR public.is_member_owner(m.partner_b_member_id)
      OR public.is_club_admin_or_permitted(v_actor,c.club_id,'champs'))
  ) THEN RETURN NEW; END IF;
 IF NOT v_courts_admin AND (NEW.user_id IS DISTINCT FROM v_actor$patch$);
 EXECUTE d;
END $fix$;