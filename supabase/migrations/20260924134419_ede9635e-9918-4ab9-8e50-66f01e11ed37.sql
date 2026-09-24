-- One placement final / 3rd-place row per tournament, division and bracket slot.
CREATE UNIQUE INDEX IF NOT EXISTS club_champs_matches_one_placement_row
  ON public.club_champs_matches (champ_id, group_number, stage, bracket_position)
  WHERE stage IN ('playoff_final','playoff_3rd') AND bracket_position IS NOT NULL;

-- Completed play-off games are history: never deleted or re-paired by a generator.
CREATE OR REPLACE FUNCTION public.guard_completed_playoff_rows()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.stage LIKE 'playoff_%' AND OLD.status = 'completed' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Completed play-off games cannot be deleted (regeneration refused).';
    END IF;
    IF NEW.player_a_member_id IS DISTINCT FROM OLD.player_a_member_id
       OR NEW.player_b_member_id IS DISTINCT FROM OLD.player_b_member_id
       OR NEW.partner_a_member_id IS DISTINCT FROM OLD.partner_a_member_id
       OR NEW.partner_b_member_id IS DISTINCT FROM OLD.partner_b_member_id
       OR NEW.stage IS DISTINCT FROM OLD.stage
       OR NEW.bracket_position IS DISTINCT FROM OLD.bracket_position THEN
      RAISE EXCEPTION 'Completed play-off games cannot be re-paired or moved (regeneration refused).';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_guard_completed_playoff_rows ON public.club_champs_matches;
CREATE TRIGGER trg_guard_completed_playoff_rows
  BEFORE UPDATE OR DELETE ON public.club_champs_matches
  FOR EACH ROW EXECUTE FUNCTION public.guard_completed_playoff_rows();