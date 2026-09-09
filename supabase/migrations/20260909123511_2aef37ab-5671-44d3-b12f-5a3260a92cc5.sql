-- 1) Mirror event-level RSVP answers onto upcoming occurrence RSVPs so replies
--    made by WhatsApp / notification show up on the event attendance lists.
CREATE OR REPLACE FUNCTION public.sync_event_rsvp_to_instances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  UPDATE public.club_event_instance_rsvps ir
     SET status = NEW.status,
         updated_at = now()
    FROM public.club_event_instances ci
   WHERE ir.instance_id = ci.id
     AND ci.event_id = NEW.event_id
     AND ci.status = 'scheduled'
     AND ci.instance_date >= (now() AT TIME ZONE 'Africa/Johannesburg')::date
     AND ir.club_member_id = NEW.club_member_id
     AND ir.status IS DISTINCT FROM NEW.status;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_event_rsvp_to_instances ON public.club_event_rsvps;
CREATE TRIGGER trg_sync_event_rsvp_to_instances
AFTER INSERT OR UPDATE OF status ON public.club_event_rsvps
FOR EACH ROW EXECUTE FUNCTION public.sync_event_rsvp_to_instances();

-- 2) When an event's date/time changes, the organiser can reset invitations so
--    everyone is asked again for the corrected time and reminders resend.
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
     AND status <> 'invited';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.club_event_instance_rsvps ir
     SET status = 'invited', updated_at = now()
    FROM public.club_event_instances ci
   WHERE ir.instance_id = ci.id
     AND ci.event_id = _event_id
     AND ci.instance_date >= (now() AT TIME ZONE 'Africa/Johannesburg')::date
     AND ir.status <> 'invited';

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

GRANT EXECUTE ON FUNCTION public.reset_event_invites(uuid) TO authenticated;