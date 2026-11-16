CREATE OR REPLACE FUNCTION public.tournament_group_display_label(p_beta jsonb, p_raw text, p_group int)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_key text; v_labels jsonb; v_disp text; v_key_disp text; v_parent text; v_child text;
BEGIN
  -- Category identity stays the stored unit key; organiser renames live in answers.categoryLabels (presentation only).
  IF p_raw IS NULL OR p_beta IS NULL OR p_group IS NULL THEN RETURN p_raw; END IF;
  v_key := p_beta -> 'answers' -> 'originalStructure' -> '_unit_keys' ->> (p_group - 1);
  v_labels := p_beta -> 'answers' -> 'categoryLabels';
  IF v_key IS NULL OR v_labels IS NULL OR jsonb_typeof(v_labels) <> 'object' THEN RETURN p_raw; END IF;
  IF position('::' IN v_key) > 0 THEN
    v_parent := split_part(v_key, '::', 1); v_child := split_part(v_key, '::', 2);
    v_disp := COALESCE(NULLIF(trim(v_labels ->> v_key), ''), COALESCE(NULLIF(trim(v_labels ->> v_parent), ''), v_parent) || ' › ' || v_child);
  ELSE
    v_disp := COALESCE(NULLIF(trim(v_labels ->> v_key), ''), v_key);
  END IF;
  v_key_disp := replace(v_key, '::', ' › ');
  IF v_disp = v_key_disp THEN RETURN p_raw; END IF;
  IF left(p_raw, length(v_key_disp)) = v_key_disp THEN
    RETURN v_disp || substring(p_raw FROM length(v_key_disp) + 1);
  END IF;
  RETURN p_raw;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tournament_division_options(p_champ_id uuid, p_member_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_label := public.tournament_group_display_label(t.beta_lifecycle, NULLIF(COALESCE(t.group_labels ->> i::text, ''), ''), i);
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
$function$;

CREATE OR REPLACE FUNCTION public.get_tournament_invite_base(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_champ record;
  v_club record;
  v_member record;
  v_group int;
  v_label text;
  v_name text;
  v_closed boolean := false;
  v_kind text;
  v_is_invitee boolean;
  v_divisions jsonb;
  v_wd_deadline timestamptz;
  v_token text;
  v_code text;
BEGIN
  v_token := trim(COALESCE(p_token, ''));

  IF length(v_token) < 32 THEN
    v_code := regexp_replace(lower(v_token), '[^a-z0-9]+$', '');
    SELECT isc.invite_token
      INTO v_token
      FROM public.invite_short_codes isc
     WHERE isc.code = v_code;
  END IF;

  IF v_token IS NULL OR length(v_token) < 32 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_reg
    FROM public.club_champs_registrations
   WHERE invite_token = v_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT id, name, subdomain INTO v_club FROM public.clubs WHERE id = v_champ.club_id;
  SELECT id, name, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;

  SELECT e.group_number INTO v_group
    FROM public.club_champs_entries e
   WHERE e.champ_id = v_reg.champ_id AND e.club_member_id = v_reg.club_member_id
   ORDER BY e.group_number LIMIT 1;

  IF v_group IS NOT NULL THEN
    v_label := COALESCE(
      public.tournament_group_display_label(
        (SELECT tt.beta_lifecycle FROM public.tournaments tt WHERE tt.id = v_reg.champ_id),
        NULLIF(v_champ.group_labels ->> v_group::text, ''), v_group),
      'League ' || v_group::text);
  END IF;

  v_divisions := public.tournament_division_options(v_reg.champ_id, v_reg.club_member_id);

  v_name := NULLIF(trim(COALESCE(v_member.name, '')), '');
  IF v_name IS NOT NULL AND position(' ' IN v_name) > 0 THEN
    v_name := split_part(v_name, ' ', 1) || ' ' || upper(left(split_part(v_name, ' ', 2), 1)) || '.';
  END IF;

  IF v_champ.registration_closes_at IS NOT NULL AND now() > v_champ.registration_closes_at THEN
    v_closed := true;
  END IF;

  IF v_reg.invite_viewed_at IS NULL THEN
    UPDATE public.club_champs_registrations SET invite_viewed_at = now() WHERE id = v_reg.id;
  END IF;

  v_is_invitee := auth.uid() IS NOT NULL AND v_member.user_id IS NOT NULL AND auth.uid() = v_member.user_id;
  v_kind := CASE WHEN v_is_invitee THEN 'none' ELSE public.invite_verification_kind(v_reg.club_member_id) END;

  v_wd_deadline := public.tournament_withdrawal_deadline(v_champ.start_date, v_champ.withdrawal_cutoff_days);

  RETURN jsonb_build_object(
    'found', true,
    'champ_id', v_champ.id,
    'tournament_name', v_champ.name,
    'description', v_champ.description,
    'start_date', v_champ.start_date,
    'end_date', v_champ.end_date,
    'registration_closes_at', v_champ.registration_closes_at,
    'registration_opens_at', v_champ.registration_opens_at,
    'entry_fee_cents', COALESCE(v_champ.entry_fee_cents, 0),
    'payment_required', COALESCE(v_champ.payment_required, false),
    'gender', v_champ.gender,
    'match_type', v_champ.match_type,
    'scoring_mode', v_champ.scoring_mode,
    'club_name', v_club.name,
    'club_subdomain', v_club.subdomain,
    'division_label', v_label,
    'divisions', v_divisions,
    'selected_divisions', to_jsonb(COALESCE(v_reg.division_choices, '{}')),
    'scheduling_mode', COALESCE(v_champ.scheduling_mode, 'club'),
    'invitee_name', v_name,
    'status', v_reg.status,
    'confirmed_at', v_reg.confirmed_at,
    'declined_at', v_reg.declined_at,
    'viewed_at', COALESCE(v_reg.invite_viewed_at, now()),
    'revoked', v_reg.invite_revoked_at IS NOT NULL,
    'registration_closed', v_closed,
    'tournament_status', v_champ.status,
    'member_has_account', v_member.user_id IS NOT NULL,
    'can_respond_public', true,
    'verification_kind', v_kind,
    'requires_login', false,
    'is_invitee', v_is_invitee,
    'withdrawals_allowed', COALESCE(v_champ.withdrawals_allowed, true),
    'withdrawal_cutoff_days', COALESCE(v_champ.withdrawal_cutoff_days, 2),
    'withdrawal_deadline', v_wd_deadline,
    'withdrawal_open', COALESCE(v_champ.withdrawals_allowed, true)
       AND (v_wd_deadline IS NULL OR now() <= v_wd_deadline)
  );
END;
$function$;