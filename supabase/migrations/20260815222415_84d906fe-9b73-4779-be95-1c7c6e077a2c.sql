CREATE OR REPLACE FUNCTION public.club_champs_compat_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.tournaments WHERE id = OLD.id;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS club_champs_compat_delete_trigger ON public.club_champs;
CREATE TRIGGER club_champs_compat_delete_trigger
INSTEAD OF DELETE ON public.club_champs
FOR EACH ROW EXECUTE FUNCTION public.club_champs_compat_delete();