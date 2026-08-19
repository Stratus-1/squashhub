CREATE OR REPLACE FUNCTION public.notify_admins_champ_proof_uploaded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_champ_name text;
  v_player text;
BEGIN
  IF NEW.proof_url IS NULL OR NEW.proof_url IS NOT DISTINCT FROM OLD.proof_url THEN
    RETURN NEW;
  END IF;

  SELECT c.club_id, c.name INTO v_club_id, v_champ_name
  FROM public.club_champs c WHERE c.id = NEW.champ_id;

  SELECT cm.name INTO v_player FROM public.club_members cm WHERE cm.id = NEW.club_member_id;

  INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url, data)
  SELECT a.user_id, a.id,
         'Proof of payment uploaded',
         COALESCE(v_player, 'A player') || ' uploaded proof of payment for ' || COALESCE(v_champ_name, 'a tournament') || '.',
         'tournament_payment_proof',
         '/club-admin?tab=tournaments',
         jsonb_build_object('champ_id', NEW.champ_id, 'registration_id', NEW.id)
  FROM public.club_members a
  WHERE a.club_id = v_club_id AND a.role = 'admin' AND a.user_id IS NOT NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_champ_proof_uploaded ON public.club_champs_registrations;
CREATE TRIGGER trg_champ_proof_uploaded
AFTER UPDATE OF proof_url ON public.club_champs_registrations
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_champ_proof_uploaded();

REVOKE EXECUTE ON FUNCTION public.notify_admins_champ_proof_uploaded() FROM anon, authenticated;