CREATE OR REPLACE FUNCTION public.leave_club_event(_event_id uuid, _club_member_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.club_events%ROWTYPE;
  v_member public.club_members%ROWTYPE;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_event FROM public.club_events WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = _club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.club_id <> v_event.club_id THEN
    RAISE EXCEPTION 'Member is not in this club';
  END IF;
  IF v_member.user_id IS DISTINCT FROM auth.uid()
     AND NOT (v_member.email IS NOT NULL
              AND v_member.email = (SELECT email FROM public.profiles WHERE id = auth.uid())) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.club_event_rsvps
     SET status = 'left', updated_at = now()
   WHERE event_id = _event_id
     AND club_member_id = _club_member_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.club_event_instance_rsvps ir
     SET status = 'left', updated_at = now()
    FROM public.club_event_instances ci
   WHERE ir.instance_id = ci.id
     AND ci.event_id = _event_id
     AND ir.club_member_id = _club_member_id
     AND ci.instance_date >= CURRENT_DATE;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_club_event(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.leave_club_event(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_event_invites(_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_creator uuid;
  v_count integer := 0;
BEGIN
  SELECT club_id, created_by INTO v_club, v_creator
    FROM public.club_events WHERE id = _event_id;
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  IF NOT (auth.uid() = v_creator
          OR public.is_club_admin(auth.uid(), v_club)
          OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.club_event_rsvps
     SET status = 'invited', updated_at = now()
   WHERE event_id = _event_id
     AND status NOT IN ('invited', 'left');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.club_event_instance_rsvps ir
     SET status = 'invited', updated_at = now()
    FROM public.club_event_instances ci
   WHERE ir.instance_id = ci.id
     AND ci.event_id = _event_id
     AND ci.instance_date >= (now() AT TIME ZONE 'Africa/Johannesburg')::date
     AND ir.status NOT IN ('invited', 'left');

  DELETE FROM public.reminder_log rl
   WHERE rl.ref_table = 'club_event_instances'
     AND rl.ref_id IN (
       SELECT ci.id::text FROM public.club_event_instances ci
        WHERE ci.event_id = _event_id
          AND ci.instance_date >= (now() AT TIME ZONE 'Africa/Johannesburg')::date
     );

  RETURN v_count;
END;
$$;