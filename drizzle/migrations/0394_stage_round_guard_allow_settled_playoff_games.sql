-- Play-off games may now be created one by one as soon as both players are certain.
-- A later addition to the same stage round is allowed ONLY when it is a different game number
-- (bracket_position) and shares no player with any game already in that round; a second copy of a
-- round still collides on game number / players and is refused as before.
CREATE OR REPLACE FUNCTION public.guard_structured_stage_round_once()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.stage_id IS NULL THEN RETURN NEW; END IF;
  -- Decided Swiss games are added one at a time; the Swiss guard enforces per-player uniqueness instead.
  IF current_setting('app.swiss_decided_game', true) = 'on' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('stage-round:' || NEW.stage_id::text || ':' || COALESCE(NEW.round_number, 0)::text));
  IF EXISTS (
    SELECT 1 FROM public.club_champs_matches m
     WHERE m.stage_id = NEW.stage_id
       AND COALESCE(m.round_number, 0) = COALESCE(NEW.round_number, 0)
       AND m.xmin <> pg_current_xact_id()::xid
       AND (
         NEW.bracket_position IS NULL OR m.bracket_position IS NULL
         OR m.bracket_position = NEW.bracket_position
         OR NEW.player_a_member_id IS NULL OR NEW.player_b_member_id IS NULL
         OR ARRAY[m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id]
            && array_remove(ARRAY[NEW.player_a_member_id, NEW.player_b_member_id, NEW.partner_a_member_id, NEW.partner_b_member_id], NULL)
       )) THEN
    RAISE EXCEPTION 'This stage round already has games (already generated)' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;