CREATE OR REPLACE FUNCTION public.champ_registration_drop_withdrawn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.club_member_id IS NOT NULL
     AND lower(COALESCE(new.status, '')) IN ('cancelled', 'declined', 'withdrawn')
     AND lower(COALESCE(old.status, '')) IS DISTINCT FROM lower(COALESCE(new.status, '')) THEN

    DELETE FROM public.club_champs_entries
     WHERE champ_id = new.champ_id
       AND (club_member_id = new.club_member_id OR partner_member_id = new.club_member_id);

    UPDATE public.tournaments
       SET draft_player_ids = array_remove(draft_player_ids, new.club_member_id)
     WHERE id = new.champ_id
       AND draft_player_ids IS NOT NULL
       AND new.club_member_id = ANY(draft_player_ids);
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_champ_registration_drop_withdrawn ON public.club_champs_registrations;
CREATE TRIGGER trg_champ_registration_drop_withdrawn
AFTER UPDATE ON public.club_champs_registrations
FOR EACH ROW
EXECUTE FUNCTION public.champ_registration_drop_withdrawn();