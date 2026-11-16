CREATE OR REPLACE FUNCTION public.tournament_join_on_club_confirm()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_pending_approval IS TRUE AND NEW.is_pending_approval IS FALSE
     AND NEW.join_source = 'tournament_link' AND NEW.role <> 'visitor' THEN
    NEW.billing_exempt := false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tournament_join_on_club_confirm ON public.club_members;
CREATE TRIGGER trg_tournament_join_on_club_confirm
  BEFORE UPDATE OF is_pending_approval ON public.club_members
  FOR EACH ROW EXECUTE FUNCTION public.tournament_join_on_club_confirm();
