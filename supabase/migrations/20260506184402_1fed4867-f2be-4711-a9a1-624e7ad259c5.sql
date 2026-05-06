CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.respond_league_week_availability(
  _club_member_id uuid,
  _week_start_date date,
  _response text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club_id uuid;
  _caller uuid := auth.uid();
  _is_self boolean;
  _is_admin boolean;
  _is_captain boolean;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _response NOT IN ('available','unavailable') THEN
    RAISE EXCEPTION 'Invalid response: %', _response;
  END IF;

  SELECT cm.club_id, (cm.user_id = _caller)
    INTO _club_id, _is_self
    FROM public.club_members cm
   WHERE cm.id = _club_member_id;

  IF _club_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  _is_admin := public.is_club_admin(_caller, _club_id);
  _is_captain := EXISTS (
    SELECT 1 FROM public.leagues l
    JOIN public.club_members cm ON cm.id = l.captain_member_id
    WHERE l.club_id = _club_id AND cm.user_id = _caller
  );

  IF NOT (_is_self OR _is_admin OR _is_captain) THEN
    RAISE EXCEPTION 'Not authorized to set availability for this member';
  END IF;

  IF _response = 'unavailable' THEN
    INSERT INTO public.league_week_unavailability (club_id, club_member_id, week_start_date, marked_by)
    VALUES (_club_id, _club_member_id, _week_start_date, _caller)
    ON CONFLICT (club_id, club_member_id, week_start_date) DO NOTHING;
  ELSE
    DELETE FROM public.league_week_unavailability
     WHERE club_id = _club_id
       AND club_member_id = _club_member_id
       AND week_start_date = _week_start_date;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_league_week_availability(uuid, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.next_league_week_start(_from date, _dow int)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _from + ((((_dow - EXTRACT(DOW FROM _from)::int) % 7) + 7) % 7);
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('notify-league-week-kickoff');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'notify-league-week-kickoff',
  '0 16 * * 2',
  $$
  SELECT net.http_post(
    url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/notify-league-week-kickoff',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6YnVwcHd6bGphZHVsd250anlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDg1MzIsImV4cCI6MjA4ODg4NDUzMn0.R4_HmBBoAna8ahkVBRGVoXR8UDMfa1ryglYn9poaHSc"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);