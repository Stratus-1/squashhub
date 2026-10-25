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
DO $patch$
DECLARE v text;
BEGIN
 v := pg_get_functiondef('public.join_club_event(uuid,uuid)'::regprocedure);
 IF position('VALUES (r.id, _club_member_id, ''confirmed'')' in v)=0 THEN RAISE EXCEPTION 'join event marker missing'; END IF;
 v := replace(v,'VALUES (r.id, _club_member_id, ''confirmed'')','VALUES (r.id, _club_member_id, CASE WHEN r.id = (SELECT id FROM public.club_event_instances WHERE event_id=_event_id AND status=''scheduled'' AND instance_date >= (now() AT TIME ZONE ''Africa/Johannesburg'')::date ORDER BY instance_date LIMIT 1) THEN ''confirmed'' ELSE ''invited'' END)');
 EXECUTE v;
 v := pg_get_functiondef('public.deliver_web_push_for_notification()'::regprocedure);
 IF position('https://fakovjdojqdwdsrkuuwm.supabase.co/functions/v1/push-notifications' in v)=0 THEN RAISE EXCEPTION 'push destination marker missing'; END IF;
 EXECUTE replace(v,'https://fakovjdojqdwdsrkuuwm.supabase.co/functions/v1/push-notifications','https://bzbuppwzljadulwntjys.supabase.co/functions/v1/push-notifications');
END $patch$;