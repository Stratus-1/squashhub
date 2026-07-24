DROP POLICY IF EXISTS "Tournament participants can score their own match"
ON public.club_champs_matches;

CREATE POLICY "Club members can score tournament matches"
ON public.club_champs_matches
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_matches.champ_id
      AND (
        public.is_club_member(auth.uid(), c.club_id)
        OR public.is_member_owner(club_champs_matches.player_a_member_id)
        OR public.is_member_owner(club_champs_matches.player_b_member_id)
        OR public.is_member_owner(club_champs_matches.partner_a_member_id)
        OR public.is_member_owner(club_champs_matches.partner_b_member_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_matches.champ_id
      AND (
        public.is_club_member(auth.uid(), c.club_id)
        OR public.is_member_owner(club_champs_matches.player_a_member_id)
        OR public.is_member_owner(club_champs_matches.player_b_member_id)
        OR public.is_member_owner(club_champs_matches.partner_a_member_id)
        OR public.is_member_owner(club_champs_matches.partner_b_member_id)
      )
  )
);

CREATE OR REPLACE FUNCTION public.guard_champ_match_participant_scoring_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club_id uuid;
  _is_allowed_marker boolean;
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

  _is_allowed_marker :=
    public.is_club_member(auth.uid(), _club_id)
    OR public.is_member_owner(OLD.player_a_member_id)
    OR public.is_member_owner(OLD.player_b_member_id)
    OR public.is_member_owner(OLD.partner_a_member_id)
    OR public.is_member_owner(OLD.partner_b_member_id);

  IF NOT _is_allowed_marker THEN
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
    RAISE EXCEPTION 'Club members can only update scores for tournament matches'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;