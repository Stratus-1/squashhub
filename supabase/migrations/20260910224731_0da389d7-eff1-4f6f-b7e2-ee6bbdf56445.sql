ALTER TABLE public.club_events ADD COLUMN IF NOT EXISTS allow_self_join boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.join_club_event(_event_id uuid, _club_member_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.club_events%ROWTYPE;
  v_member public.club_members%ROWTYPE;
  v_rsvp_id uuid;
  r RECORD;
BEGIN
  SELECT * INTO v_event FROM public.club_events WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF NOT COALESCE(v_event.allow_self_join, false) THEN
    RAISE EXCEPTION 'This event is invitation only';
  END IF;
  IF COALESCE(v_event.status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'This event is not open';
  END IF;

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

  INSERT INTO public.club_event_rsvps (event_id, club_member_id, status)
  VALUES (_event_id, _club_member_id, 'confirmed')
  ON CONFLICT (event_id, club_member_id) DO UPDATE SET status = 'confirmed'
  RETURNING id INTO v_rsvp_id;

  IF v_rsvp_id IS NULL THEN
    SELECT id INTO v_rsvp_id FROM public.club_event_rsvps
     WHERE event_id = _event_id AND club_member_id = _club_member_id;
  END IF;

  FOR r IN SELECT id FROM public.club_event_instances
            WHERE event_id = _event_id AND instance_date >= CURRENT_DATE
  LOOP
    INSERT INTO public.club_event_instance_rsvps (instance_id, club_member_id, status)
    VALUES (r.id, _club_member_id, 'confirmed')
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_rsvp_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_club_event(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.join_club_event(uuid, uuid) TO authenticated;