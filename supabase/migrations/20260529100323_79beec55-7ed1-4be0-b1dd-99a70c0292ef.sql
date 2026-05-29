-- Make the event-instance notification trigger respect invite_scope.
-- When invite_scope='none', never broadcast invitations even if RSVPs slip in.
CREATE OR REPLACE FUNCTION public.notify_on_club_event_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event record;
  v_creator_name text;
  r record;
BEGIN
  SELECT * INTO v_event FROM public.club_events WHERE id = NEW.event_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Respect "no invitations" scope: never notify anyone.
  IF COALESCE(v_event.invite_scope, 'all') = 'none' THEN
    RETURN NEW;
  END IF;

  SELECT cm.name INTO v_creator_name
  FROM public.club_members cm WHERE cm.id = v_event.booked_by_member_id;

  -- Only notify members who have an RSVP for this specific instance.
  -- (App side only inserts RSVPs for the selected scope, so this is
  -- automatically limited to: all / category / league / selected.)
  FOR r IN
    SELECT cir.club_member_id
    FROM public.club_event_instance_rsvps cir
    WHERE cir.instance_id = NEW.id
      AND cir.club_member_id IS DISTINCT FROM v_event.booked_by_member_id
  LOOP
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      r.club_member_id,
      COALESCE((SELECT user_id FROM public.club_members WHERE id = r.club_member_id), '00000000-0000-0000-0000-000000000000'),
      'Event invitation',
      COALESCE(v_creator_name, 'Your club') || ' invited you to "' || v_event.title || '" on ' || NEW.instance_date::text,
      'booking',
      '/events/' || v_event.id::text,
      jsonb_build_object('event_id', v_event.id, 'instance_id', NEW.id)
    );
  END LOOP;

  RETURN NEW;
END;
$function$;