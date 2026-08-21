CREATE OR REPLACE FUNCTION public.enforce_confirmed_tournament_division_choice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num_groups integer;
  v_allowed integer[];
  v_invalid_count integer;
BEGIN
  -- Admins may prepare or pre-mark a registration before the player responds.
  -- The division requirement starts only when the invitation is confirmed.
  IF NEW.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT GREATEST(COALESCE(t.num_groups, 1), 1)
    INTO v_num_groups
    FROM public.tournaments t
   WHERE t.id = NEW.champ_id;

  IF COALESCE(v_num_groups, 1) <= 1 THEN
    RETURN NEW;
  END IF;

  IF COALESCE(array_length(NEW.division_choices, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Please update SquashHub and choose at least one division before accepting this invitation';
  END IF;

  SELECT array_agg((d ->> 'group_number')::integer)
    INTO v_allowed
    FROM jsonb_array_elements(public.tournament_division_options(NEW.champ_id, NEW.club_member_id)) d;

  SELECT count(*)
    INTO v_invalid_count
    FROM unnest(NEW.division_choices) choice
   WHERE NOT (choice = ANY (COALESCE(v_allowed, '{}')));

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'One or more selected divisions are no longer available. Please reload and choose again';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_confirmed_tournament_division_choice_trigger
  ON public.club_champs_registrations;
CREATE TRIGGER enforce_confirmed_tournament_division_choice_trigger
BEFORE INSERT OR UPDATE OF confirmed_at, division_choices, champ_id, club_member_id
ON public.club_champs_registrations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_confirmed_tournament_division_choice();

DELETE FROM public.club_champs_entries
 WHERE champ_id = '8c405b3f-1b90-4a22-9d8a-54856ec21c33'::uuid
   AND club_member_id = '6a2d7300-d716-40d6-b179-e95b9244a5c8'::uuid;

UPDATE public.club_champs_registrations
   SET status = 'invited',
       division_choices = '{}',
       confirmed_at = NULL,
       confirmed_by = NULL,
       confirmation_source = NULL,
       declined_at = NULL,
       paid_at = NULL,
       fee_paid_cents = 0,
       fee_payment_id = NULL,
       payment_ref = NULL,
       proof_url = NULL,
       proof_uploaded_at = NULL,
       proof_uploaded_by = NULL,
       updated_at = now()
 WHERE id = '32155cee-7f82-4dc5-8704-2d80097cf39b'::uuid
   AND champ_id = '8c405b3f-1b90-4a22-9d8a-54856ec21c33'::uuid
   AND club_member_id = '6a2d7300-d716-40d6-b179-e95b9244a5c8'::uuid;