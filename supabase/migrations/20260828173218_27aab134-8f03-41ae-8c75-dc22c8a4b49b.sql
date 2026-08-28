ALTER TABLE public.email_outbox ADD COLUMN IF NOT EXISTS cc_emails text[];

CREATE OR REPLACE FUNCTION public.queue_champ_result_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_club_id uuid;
  v_club_name text;
  v_enabled boolean;
  v_champ_name text;
  v_score text;
  v_winners uuid[];
  v_losers uuid[];
  v_cc text[];
  m record;
  v_body text;
  v_subject text;
BEGIN
  IF NEW.is_bye THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, '') <> 'completed' THEN RETURN NEW; END IF;
  IF NEW.winner_member_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.status, '') = 'completed'
     AND COALESCE(OLD.winner_member_id::text, '') = COALESCE(NEW.winner_member_id::text, '') THEN
    RETURN NEW;
  END IF;

  SELECT t.club_id, t.name INTO v_club_id, v_champ_name
    FROM public.tournaments t WHERE t.id = NEW.champ_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  SELECT c.name, COALESCE(c.champ_result_emails, true) INTO v_club_name, v_enabled
    FROM public.clubs c WHERE c.id = v_club_id;
  IF NOT COALESCE(v_enabled, true) THEN RETURN NEW; END IF;

  -- Admin copy: club contact address, else up to 3 active club admins
  SELECT NULLIF(ARRAY(
    SELECT DISTINCT lower(trim(e)) FROM (
      SELECT c.email AS e FROM public.clubs c
       WHERE c.id = v_club_id AND c.email IS NOT NULL AND length(trim(c.email)) > 3
      UNION ALL
      SELECT cm.email FROM public.club_members cm
       WHERE cm.club_id = v_club_id
         AND cm.role = 'admin'
         AND COALESCE(cm.status, 'active') = 'active'
         AND cm.email IS NOT NULL AND length(trim(cm.email)) > 3
       LIMIT 3
    ) s
  ), '{}') INTO v_cc;

  IF NEW.winner_member_id IN (NEW.player_a_member_id, NEW.partner_a_member_id) THEN
    v_winners := ARRAY[NEW.player_a_member_id, NEW.partner_a_member_id];
    v_losers  := ARRAY[NEW.player_b_member_id, NEW.partner_b_member_id];
  ELSE
    v_winners := ARRAY[NEW.player_b_member_id, NEW.partner_b_member_id];
    v_losers  := ARRAY[NEW.player_a_member_id, NEW.partner_a_member_id];
  END IF;

  v_score := NULLIF(trim(COALESCE(NEW.score, '')), '');

  FOR m IN
    SELECT cm.id, cm.name, cm.email, x.won
      FROM (
        SELECT unnest(v_winners) AS member_id, true AS won
        UNION ALL
        SELECT unnest(v_losers), false
      ) x
      JOIN public.club_members cm ON cm.id = x.member_id
     WHERE cm.email IS NOT NULL AND length(trim(cm.email)) > 3
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.email_outbox eo
       WHERE eo.ref_id = NEW.id AND eo.kind = 'champ_result' AND eo.club_member_id = m.id
    ) THEN
      CONTINUE;
    END IF;

    IF m.won THEN
      v_subject := 'Well played, ' || split_part(COALESCE(m.name, 'champ'), ' ', 1) || ' — you won your ' || COALESCE(v_champ_name, 'championship') || ' match';
      v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\n'
        || 'Congratulations on your win in ' || COALESCE(v_champ_name, 'the club championship') || '!'
        || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
        || E'\n\nThat is another one in the bag and your name stays in the draw. Keep the racquet warm — the next round is coming.'
        || E'\n\nEnjoy the win, and thanks for playing your match on time.\n\n'
        || COALESCE(v_club_name, 'Your club');
    ELSE
      v_subject := 'Hard luck, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — great effort in ' || COALESCE(v_champ_name, 'the championship');
      v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\n'
        || 'Tough one today in ' || COALESCE(v_champ_name, 'the club championship') || '.'
        || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
        || E'\n\nThank you for stepping on court and giving it everything — that is what makes our championship worth playing. Every match on the T makes you sharper, and we would love to see you back for the next one.'
        || E'\n\nWell played, and see you on court soon.\n\n'
        || COALESCE(v_club_name, 'Your club');
    END IF;

    INSERT INTO public.email_outbox (club_id, club_member_id, recipient_email, recipient_name, subject, body, kind, ref_id, cc_emails)
    VALUES (v_club_id, m.id, trim(m.email), m.name, v_subject, v_body, 'champ_result', NEW.id, v_cc);
  END LOOP;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.queue_champ_result_emails() FROM PUBLIC, anon, authenticated;