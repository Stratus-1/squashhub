CREATE OR REPLACE FUNCTION public.normalize_reopened_tournament_invite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'cancelled'
     AND NEW.status IN ('invited', 'pending_payment') THEN
    NEW.declined_at := NULL;
    NEW.confirmed_at := NULL;
    NEW.confirmed_by := NULL;
    IF NEW.confirmation_source IN ('rsvp', 'withdrawn') THEN
      NEW.confirmation_source := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_reopened_tournament_invite
ON public.club_champs_registrations;

CREATE TRIGGER trg_normalize_reopened_tournament_invite
BEFORE UPDATE OF status ON public.club_champs_registrations
FOR EACH ROW
EXECUTE FUNCTION public.normalize_reopened_tournament_invite();