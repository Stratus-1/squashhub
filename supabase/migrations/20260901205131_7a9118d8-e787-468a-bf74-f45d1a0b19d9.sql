CREATE OR REPLACE FUNCTION public.apply_registration_division_choices(p_registration_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  gn int;
  v_choices int[];
  v_single boolean;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND OR COALESCE(array_length(r.division_choices, 1), 0) = 0 THEN RETURN; END IF;

  SELECT c.scoring_mode = 'time_capped_points' INTO v_single
    FROM public.club_champs c WHERE c.id = r.champ_id;

  v_choices := r.division_choices;
  -- Bells plays every league simultaneously: only one entry is possible.
  IF COALESCE(v_single, false) AND array_length(v_choices, 1) > 1 THEN
    v_choices := ARRAY[v_choices[1]];
    UPDATE public.club_champs_registrations
       SET division_choices = v_choices
     WHERE id = r.id;
  END IF;

  FOREACH gn IN ARRAY v_choices LOOP
    INSERT INTO public.club_champs_entries (champ_id, club_member_id, group_number, partner_member_id)
    VALUES (r.champ_id, r.club_member_id, gn, r.partner_member_id)
    ON CONFLICT (champ_id, club_member_id, group_number) DO NOTHING;
  END LOOP;

  DELETE FROM public.club_champs_entries e
   WHERE e.champ_id = r.champ_id
     AND e.club_member_id = r.club_member_id
     AND NOT (e.group_number = ANY (v_choices));
END;
$function$;