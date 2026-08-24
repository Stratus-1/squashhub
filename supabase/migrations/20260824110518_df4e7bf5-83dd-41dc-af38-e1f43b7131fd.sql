CREATE OR REPLACE FUNCTION public.unschedule_champ_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _m public.club_champs_matches%ROWTYPE;
  _club_id uuid;
  _champ_name text;
  _is_participant boolean;
  _can_manage boolean;
  _r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM public.club_champs_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.club_id, c.name INTO _club_id, _champ_name
  FROM public.club_champs c WHERE c.id = _m.champ_id;

  _is_participant :=
       public.is_member_owner(_m.player_a_member_id)
    OR public.is_member_owner(_m.player_b_member_id)
    OR public.is_member_owner(_m.partner_a_member_id)
    OR public.is_member_owner(_m.partner_b_member_id);
  _can_manage := public.is_club_admin_or_permitted(auth.uid(), _club_id, 'champs');

  IF NOT (_is_participant OR _can_manage) THEN
    RAISE EXCEPTION 'Only the players in this match or an organiser can change its schedule' USING ERRCODE = '42501';
  END IF;

  IF _m.is_bye OR _m.status IN ('completed', 'forfeited', 'walkover') THEN
    RAISE EXCEPTION 'This match is already decided — its schedule cannot be cleared' USING ERRCODE = '22023';
  END IF;

  IF _m.booking_id IS NOT NULL THEN
    UPDATE public.bookings SET status = 'cancelled' WHERE id = _m.booking_id;
  END IF;

  PERFORM set_config('app.self_schedule', '1', true);
  UPDATE public.club_champs_matches
     SET court_id = NULL,
         scheduled_date = NULL,
         scheduled_time = NULL,
         booking_id = NULL,
         updated_at = now()
   WHERE id = p_match_id;
  PERFORM set_config('app.self_schedule', '', true);

  FOR _r IN
    SELECT DISTINCT cm.user_id, cm.id AS member_id
    FROM public.club_members cm
    WHERE cm.id IN (_m.player_a_member_id, _m.player_b_member_id, _m.partner_a_member_id, _m.partner_b_member_id)
      AND cm.user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url)
    VALUES (
      _r.user_id,
      _r.member_id,
      'Tournament match unscheduled',
      coalesce(_champ_name, 'Tournament') || ' — your match no longer has a court or time. A new slot must be arranged.',
      'tournament',
      '/club-champs/' || _m.champ_id
    );
  END LOOP;

  RETURN jsonb_build_object('match_id', p_match_id, 'unscheduled', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.unschedule_champ_match(uuid) TO authenticated;