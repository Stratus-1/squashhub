-- Positive availability confirmations per (club, member, week)
CREATE TABLE IF NOT EXISTS public.league_week_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL,
  club_member_id UUID NOT NULL,
  week_start_date DATE NOT NULL,
  marked_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT league_week_availability_unique UNIQUE (club_id, club_member_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_lwa_club_week ON public.league_week_availability(club_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_lwa_member ON public.league_week_availability(club_member_id);

ALTER TABLE public.league_week_availability ENABLE ROW LEVEL SECURITY;

-- Read: members of the club can see availability for their club
CREATE POLICY "Club members can view availability"
ON public.league_week_availability
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = league_week_availability.club_id
      AND cm.user_id = auth.uid()
  )
);

-- Insert/Delete: handled exclusively by the SECURITY DEFINER RPC below.
-- (No direct write policy — RPC runs as definer.)

-- Update RPC to record positive availability too
CREATE OR REPLACE FUNCTION public.respond_league_week_availability(
  _club_member_id uuid,
  _week_start_date date,
  _response text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- Mark unavailable, clear any prior availability confirmation
    INSERT INTO public.league_week_unavailability (club_id, club_member_id, week_start_date, marked_by)
    VALUES (_club_id, _club_member_id, _week_start_date, _caller)
    ON CONFLICT (club_id, club_member_id, week_start_date) DO NOTHING;

    DELETE FROM public.league_week_availability
     WHERE club_id = _club_id
       AND club_member_id = _club_member_id
       AND week_start_date = _week_start_date;
  ELSE
    -- Mark available, clear any prior unavailability
    DELETE FROM public.league_week_unavailability
     WHERE club_id = _club_id
       AND club_member_id = _club_member_id
       AND week_start_date = _week_start_date;

    INSERT INTO public.league_week_availability (club_id, club_member_id, week_start_date, marked_by)
    VALUES (_club_id, _club_member_id, _week_start_date, _caller)
    ON CONFLICT (club_id, club_member_id, week_start_date) DO NOTHING;
  END IF;
END;
$function$;