ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS withdrawn_keep_position boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS withdrawn_reason text;
COMMENT ON COLUMN public.club_champs_registrations.withdrawn_keep_position IS 'Player withdrew mid-tournament but keeps their position; every new game against them is an automatic walkover for the opponent';

CREATE OR REPLACE FUNCTION public.champ_auto_walkover_withdrawn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE wa boolean; wb boolean;
BEGIN
  IF COALESCE(NEW.is_bye,false) OR NEW.winner_member_id IS NOT NULL
     OR NEW.player_a_member_id IS NULL OR NEW.player_b_member_id IS NULL
     OR NEW.partner_a_member_id IS NOT NULL OR NEW.partner_b_member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT bool_or(withdrawn_keep_position) INTO wa FROM public.club_champs_registrations
   WHERE champ_id = NEW.champ_id AND club_member_id = NEW.player_a_member_id;
  SELECT bool_or(withdrawn_keep_position) INTO wb FROM public.club_champs_registrations
   WHERE champ_id = NEW.champ_id AND club_member_id = NEW.player_b_member_id;
  IF COALESCE(wa,false) AND NOT COALESCE(wb,false) THEN
    NEW.winner_member_id := NEW.player_b_member_id; NEW.forfeit_member_id := NEW.player_a_member_id;
    NEW.score := '0-3 (w/o)'; NEW.status := 'completed';
  ELSIF COALESCE(wb,false) AND NOT COALESCE(wa,false) THEN
    NEW.winner_member_id := NEW.player_a_member_id; NEW.forfeit_member_id := NEW.player_b_member_id;
    NEW.score := '3-0 (w/o)'; NEW.status := 'completed';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.champ_auto_walkover_withdrawn() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a0_champ_auto_walkover_withdrawn ON public.club_champs_matches;
CREATE TRIGGER a0_champ_auto_walkover_withdrawn
  BEFORE INSERT ON public.club_champs_matches
  FOR EACH ROW EXECUTE FUNCTION public.champ_auto_walkover_withdrawn();