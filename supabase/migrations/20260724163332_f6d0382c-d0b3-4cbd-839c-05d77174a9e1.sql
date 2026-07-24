CREATE OR REPLACE FUNCTION public.guard_champ_match_participant_scoring_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club_id uuid;
  _is_participant boolean;
BEGIN
  SELECT c.club_id INTO _club_id
  FROM public.club_champs c
  WHERE c.id = OLD.champ_id;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_club_admin_or_permitted(auth.uid(), _club_id, 'champs') THEN
    RETURN NEW;
  END IF;

  _is_participant :=
    public.is_member_owner(OLD.player_a_member_id)
    OR public.is_member_owner(OLD.player_b_member_id)
    OR public.is_member_owner(OLD.partner_a_member_id)
    OR public.is_member_owner(OLD.partner_b_member_id);

  IF NOT _is_participant THEN
    RETURN NEW;
  END IF;

  IF NEW.champ_id IS DISTINCT FROM OLD.champ_id
    OR NEW.group_number IS DISTINCT FROM OLD.group_number
    OR NEW.round_number IS DISTINCT FROM OLD.round_number
    OR NEW.player_a_member_id IS DISTINCT FROM OLD.player_a_member_id
    OR NEW.player_b_member_id IS DISTINCT FROM OLD.player_b_member_id
    OR NEW.partner_a_member_id IS DISTINCT FROM OLD.partner_a_member_id
    OR NEW.partner_b_member_id IS DISTINCT FROM OLD.partner_b_member_id
    OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
    OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time
    OR NEW.court_id IS DISTINCT FROM OLD.court_id
    OR NEW.leg IS DISTINCT FROM OLD.leg
    OR NEW.is_bye IS DISTINCT FROM OLD.is_bye
    OR NEW.bye_member_id IS DISTINCT FROM OLD.bye_member_id
    OR NEW.handicap_a IS DISTINCT FROM OLD.handicap_a
    OR NEW.handicap_b IS DISTINCT FROM OLD.handicap_b
    OR NEW.handicap_locked IS DISTINCT FROM OLD.handicap_locked
    OR NEW.pool_number IS DISTINCT FROM OLD.pool_number
    OR NEW.stage IS DISTINCT FROM OLD.stage
    OR NEW.stage_label IS DISTINCT FROM OLD.stage_label
    OR NEW.bracket_position IS DISTINCT FROM OLD.bracket_position
    OR NEW.placeholder_a IS DISTINCT FROM OLD.placeholder_a
    OR NEW.placeholder_b IS DISTINCT FROM OLD.placeholder_b
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Players can only update scores for their own tournament match'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_champ_match_participant_scoring_update
ON public.club_champs_matches;

CREATE TRIGGER guard_champ_match_participant_scoring_update
BEFORE UPDATE ON public.club_champs_matches
FOR EACH ROW
EXECUTE FUNCTION public.guard_champ_match_participant_scoring_update();

DROP POLICY IF EXISTS "Tournament participants can score their own match"
ON public.club_champs_matches;

CREATE POLICY "Tournament participants can score their own match"
ON public.club_champs_matches
FOR UPDATE
TO authenticated
USING (
  public.is_member_owner(player_a_member_id)
  OR public.is_member_owner(player_b_member_id)
  OR public.is_member_owner(partner_a_member_id)
  OR public.is_member_owner(partner_b_member_id)
)
WITH CHECK (
  public.is_member_owner(player_a_member_id)
  OR public.is_member_owner(player_b_member_id)
  OR public.is_member_owner(partner_a_member_id)
  OR public.is_member_owner(partner_b_member_id)
);