CREATE OR REPLACE FUNCTION public.club_champs_compat_stage_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target uuid;
BEGIN
  target := COALESCE(NEW.id, OLD.id);
  UPDATE public.tournaments SET
    pool_durations = COALESCE(NEW.pool_durations, pool_durations),
    division_follows = COALESCE(NEW.division_follows, division_follows),
    division_seed_source = COALESCE(NEW.division_seed_source, division_seed_source),
    division_pairing_method = COALESCE(NEW.division_pairing_method, division_pairing_method)
  WHERE id = target;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS club_champs_compat_stage_insert ON public.club_champs;
DROP TRIGGER IF EXISTS club_champs_compat_stage_update ON public.club_champs;

CREATE TRIGGER club_champs_compat_stage_insert
INSTEAD OF INSERT ON public.club_champs
FOR EACH ROW EXECUTE FUNCTION public.club_champs_compat_stage_write();

CREATE TRIGGER club_champs_compat_stage_update
INSTEAD OF UPDATE ON public.club_champs
FOR EACH ROW EXECUTE FUNCTION public.club_champs_compat_stage_write();