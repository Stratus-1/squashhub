CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE public.club_events(id uuid,club_id uuid,notify_email boolean,notify_push boolean);
CREATE TABLE public.notifications(id integer,data jsonb);
CREATE OR REPLACE FUNCTION public.event_notification_channel_preferences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_event public.club_events%ROWTYPE; v_event_id text;
BEGIN
 IF jsonb_typeof(NEW.data) = 'string' THEN
   BEGIN NEW.data := (NEW.data #>> '{}')::jsonb; EXCEPTION WHEN invalid_text_representation THEN RETURN NEW; END;
 END IF;
 v_event_id := NEW.data->>'event_id';
 IF v_event_id IS NULL OR v_event_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NEW; END IF;
 SELECT * INTO v_event FROM public.club_events WHERE id=v_event_id::uuid;
 IF NOT FOUND THEN RETURN NEW; END IF;
 NEW.data := COALESCE(NEW.data,'{}'::jsonb) || jsonb_build_object('club_id',v_event.club_id);
 IF NOT COALESCE(v_event.notify_email,false) THEN NEW.data:=NEW.data || '{"suppress_email":"true"}'::jsonb; END IF;
 IF NOT COALESCE(v_event.notify_push,false) THEN NEW.data:=NEW.data || '{"suppress_push":"true"}'::jsonb; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.event_notification_channel_preferences() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_event_notification_channel_preferences BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.event_notification_channel_preferences();

INSERT INTO club_events VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',false,true);
INSERT INTO notifications VALUES (1,'{"event_id":"00000000-0000-0000-0000-000000000001"}');
DO $$ BEGIN
 IF (SELECT data->>'suppress_email' FROM notifications WHERE id=1) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Disabled email leaked'; END IF;
 IF (SELECT data->>'suppress_push' FROM notifications WHERE id=1)='true' THEN RAISE EXCEPTION 'Enabled push suppressed'; END IF;
END $$;
UPDATE club_events SET notify_email=true,notify_push=false;
INSERT INTO notifications VALUES (2,'{"event_id":"00000000-0000-0000-0000-000000000001","suppress_email":"true"}');
DO $$ BEGIN
 IF (SELECT data->>'suppress_push' FROM notifications WHERE id=2) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Disabled push leaked'; END IF;
 IF (SELECT data->>'suppress_email' FROM notifications WHERE id=2) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Explicit suppression erased'; END IF;
END $$;
INSERT INTO notifications VALUES (3,to_jsonb('{"event_id":"00000000-0000-0000-0000-000000000001"}'::text));
DO $$ BEGIN
 IF (SELECT data->>'suppress_push' FROM notifications WHERE id=3) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Legacy string data bypassed switches'; END IF;
END $$;
