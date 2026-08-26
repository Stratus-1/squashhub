SELECT set_config('app.ladder_change_source', 'admin_reorder', true);

UPDATE public.club_members SET ladder_position = NULL WHERE role = 'visitor' AND ladder_position IS NOT NULL;

CREATE OR REPLACE FUNCTION public.club_members_visitors_off_ladder()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'visitor' THEN
    NEW.ladder_position := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_club_members_visitors_off_ladder ON public.club_members;
CREATE TRIGGER trg_club_members_visitors_off_ladder
BEFORE INSERT OR UPDATE ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.club_members_visitors_off_ladder();