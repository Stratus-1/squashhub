-- Per-event entry fees: tournaments may price each division differently.
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS division_fees jsonb;

-- Division options now carry each event's fee (explicit per-division fee, else the flat entry fee).
CREATE OR REPLACE FUNCTION public.tournament_division_options(p_champ_id uuid, p_member_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  t record; i int; v_div_gender text; v_label text; v_member_gender text; v_type text;
  v_flat int; v_req boolean; out_arr jsonb := '[]'::jsonb;
BEGIN
  SELECT id, num_groups, gender, group_labels, league_genders, league_formats, league_match_types, match_type, beta_lifecycle, club_id, league_sources, division_fees
    INTO t FROM public.tournaments WHERE id = p_champ_id;
  IF NOT FOUND THEN RETURN out_arr; END IF;
  SELECT coalesce(payment_required, false) INTO v_req FROM public.club_champs WHERE id = p_champ_id;
  v_flat := coalesce(public.champ_entry_fee_cents(p_champ_id), 0);
  IF p_member_id IS NOT NULL AND t.beta_lifecycle ? 'category_types' THEN
    SELECT gender INTO v_member_gender FROM public.club_members WHERE id = p_member_id AND club_id = t.club_id;
  END IF;
  FOR i IN 1..GREATEST(COALESCE(t.num_groups, 1), 1) LOOP
    v_div_gender := lower(COALESCE(NULLIF(COALESCE(t.league_genders ->> i::text, ''), ''), COALESCE(t.gender, 'open')));
    v_type := t.beta_lifecycle -> 'category_types' ->> i::text;
    IF v_type IS NOT NULL AND p_member_id IS NOT NULL THEN
      IF v_member_gender IS NULL AND v_type IN ('mens','ladies') THEN CONTINUE; END IF;
      IF v_type = 'mens' AND lower(coalesce(v_member_gender,'')) NOT IN ('m','male','men','man','mens','men''s','gents') THEN CONTINUE; END IF;
      IF v_type = 'ladies' AND lower(coalesce(v_member_gender,'')) NOT IN ('f','female','ladies','lady','woman','women') THEN CONTINUE; END IF;
    END IF;
    IF p_member_id IS NOT NULL
       AND t.league_sources -> i::text IS NOT NULL
       AND jsonb_typeof(t.league_sources -> i::text) = 'array'
       AND jsonb_array_length(t.league_sources -> i::text) > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.member_league_registrations mlr
        WHERE mlr.club_member_id = p_member_id
          AND mlr.league_id::text IN (SELECT jsonb_array_elements_text(t.league_sources -> i::text))
      ) THEN CONTINUE; END IF;
    END IF;
    v_label := NULLIF(COALESCE(t.group_labels ->> i::text, ''), '');
    IF v_label IS NULL THEN v_label := 'League ' || i::text; END IF;
    out_arr := out_arr || jsonb_build_object(
      'group_number', i,
      'label', v_label,
      'gender', coalesce(v_type, v_div_gender),
      'format', COALESCE(t.league_formats ->> i::text, ''),
      'match_type', COALESCE(t.league_match_types ->> i::text, t.match_type),
      'fee_cents', CASE WHEN coalesce(v_req, false)
        THEN coalesce((t.division_fees ->> i::text)::int, v_flat)
        ELSE 0 END
    );
  END LOOP;
  RETURN out_arr;
END;
$fn$;

REVOKE ALL ON FUNCTION public.tournament_division_options(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_division_options(uuid, uuid) TO anon, authenticated, service_role;

-- Amount due: sum the fee of each event the player pays for themselves (partner-covered events excluded).
-- Falls back to flat fee x own events when no per-division fees are configured.
CREATE OR REPLACE FUNCTION public.champ_reg_own_due_cents(p_reg_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record; c record; t record; v_flat int; v_total int;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_reg_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO c FROM public.club_champs WHERE id = r.champ_id;
  SELECT division_fees INTO t FROM public.tournaments WHERE id = r.champ_id;
  v_flat := coalesce(public.champ_entry_fee_cents(r.champ_id), coalesce(c.entry_fee_cents, 0));
  IF coalesce(c.payment_required, false)
     AND t.division_fees IS NOT NULL
     AND t.division_fees <> 'null'::jsonb THEN
    SELECT coalesce(sum(coalesce((t.division_fees ->> g::text)::int, v_flat)), 0) INTO v_total
      FROM unnest(public.champ_reg_groups(r.division_choices)) g
     WHERE NOT public.champ_event_covered_by_other(r.id, g);
    RETURN v_total;
  END IF;
  RETURN v_flat * public.champ_reg_own_events(r.id);
END;
$fn$;