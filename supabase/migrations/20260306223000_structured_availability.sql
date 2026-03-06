-- Structured availability blocks (days/times) instead of free-text.
-- Also maintains a denormalized `profiles.availability` summary for existing UI.

CREATE TABLE IF NOT EXISTS public.player_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- ISO: 1=Mon ... 7=Sun
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS player_availability_user_day_idx
  ON public.player_availability (user_id, day_of_week, start_time);

ALTER TABLE public.player_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Availability viewable by authenticated" ON public.player_availability;
CREATE POLICY "Availability viewable by authenticated"
  ON public.player_availability FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can manage own availability" ON public.player_availability;
CREATE POLICY "Users can manage own availability"
  ON public.player_availability FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_player_availability_updated_at ON public.player_availability;
CREATE TRIGGER update_player_availability_updated_at
  BEFORE UPDATE ON public.player_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Build a compact summary like: "Mon 18:00-19:30; Wed 07:00-08:00"
CREATE OR REPLACE FUNCTION public.update_profile_availability_summary(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  summary text;
BEGIN
  SELECT string_agg(part, '; ' ORDER BY day_of_week, start_time)
  INTO summary
  FROM (
    SELECT
      pa.day_of_week,
      pa.start_time,
      concat(
        CASE pa.day_of_week
          WHEN 1 THEN 'Mon'
          WHEN 2 THEN 'Tue'
          WHEN 3 THEN 'Wed'
          WHEN 4 THEN 'Thu'
          WHEN 5 THEN 'Fri'
          WHEN 6 THEN 'Sat'
          WHEN 7 THEN 'Sun'
        END,
        ' ',
        to_char(pa.start_time, 'HH24:MI'),
        '-',
        to_char(pa.end_time, 'HH24:MI')
      ) AS part
    FROM public.player_availability pa
    WHERE pa.user_id = target_user_id
  ) t;

  UPDATE public.profiles
  SET availability = COALESCE(summary, ''), updated_at = now()
  WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_player_availability_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.update_profile_availability_summary(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS player_availability_change_trigger ON public.player_availability;
CREATE TRIGGER player_availability_change_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.player_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.on_player_availability_change();

-- Atomic replace availability blocks for the current user.
CREATE OR REPLACE FUNCTION public.set_my_availability(blocks jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  item jsonb;
  dow integer;
  st time;
  et time;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.player_availability WHERE user_id = uid;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(blocks, '[]'::jsonb)) LOOP
    dow := (item->>'day_of_week')::integer;
    st := (item->>'start_time')::time;
    et := (item->>'end_time')::time;

    INSERT INTO public.player_availability (user_id, day_of_week, start_time, end_time)
    VALUES (uid, dow, st, et);
  END LOOP;

  PERFORM public.update_profile_availability_summary(uid);
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_availability(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_availability(jsonb) TO authenticated;

