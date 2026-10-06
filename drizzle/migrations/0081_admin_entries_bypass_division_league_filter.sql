CREATE OR REPLACE FUNCTION public.enforce_confirmed_tournament_division_choice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num_groups integer;
  v_allowed integer[];
  v_invalid_count integer;
BEGIN
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

  -- Admin-entered players may be placed in any existing division (admin override of league scope);
  -- category/gender rules are still enforced by beta_tournament_category_guard.
  IF COALESCE(NEW.invited_by_admin, false) THEN
    SELECT count(*) INTO v_invalid_count
      FROM unnest(NEW.division_choices) choice
     WHERE choice < 1 OR choice > v_num_groups;
  ELSE
    SELECT array_agg((d ->> 'group_number')::integer)
      INTO v_allowed
      FROM jsonb_array_elements(public.tournament_division_options(NEW.champ_id, NEW.club_member_id)) d;

    SELECT count(*)
      INTO v_invalid_count
      FROM unnest(NEW.division_choices) choice
     WHERE NOT (choice = ANY (COALESCE(v_allowed, '{}')));
  END IF;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'One or more selected divisions are no longer available. Please reload and choose again';
  END IF;

  RETURN NEW;
END;
$function$;