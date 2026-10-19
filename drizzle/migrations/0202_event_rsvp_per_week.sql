CREATE OR REPLACE FUNCTION public.sync_event_rsvp_to_instances()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_today date := (now() AT TIME ZONE 'Africa/Johannesburg')::date; v_next uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  -- A Yes/No answer is for one week only; left/invited still apply to the series.
  IF NEW.status IN ('confirmed','declined') THEN
    SELECT id INTO v_next FROM public.club_event_instances
     WHERE event_id = NEW.event_id AND status = 'scheduled' AND instance_date >= v_today
     ORDER BY instance_date LIMIT 1;
    UPDATE public.club_event_instance_rsvps SET status = NEW.status, updated_at = now()
     WHERE instance_id = v_next AND club_member_id = NEW.club_member_id
       AND status IS DISTINCT FROM NEW.status AND status <> 'left';
    RETURN NEW;
  END IF;
  UPDATE public.club_event_instance_rsvps ir SET status = NEW.status, updated_at = now()
    FROM public.club_event_instances ci
   WHERE ir.instance_id = ci.id AND ci.event_id = NEW.event_id AND ci.status = 'scheduled'
     AND ci.instance_date >= v_today AND ir.club_member_id = NEW.club_member_id
     AND ir.status IS DISTINCT FROM NEW.status;
  RETURN NEW;
END;
$function$;